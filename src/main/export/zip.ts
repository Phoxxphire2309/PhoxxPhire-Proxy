import { deflateRawSync } from 'node:zlib'

/**
 * Minimal ZIP archive writer built on Node's `zlib` (no external dependency).
 * Each entry is DEFLATE-compressed (falling back to stored when that would be
 * larger) and assembled into a standard ZIP: local file headers + data, a
 * central directory, then the end-of-central-directory record. Sufficient for
 * bundling card images; not a general-purpose archiver (no zip64, no folders).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** DOS date/time fields for a given Date (ZIP stores modification time this way). */
function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f)
  const dosDate =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | (date.getDate() & 0x1f)
  return { time: time & 0xffff, date: dosDate & 0xffff }
}

interface CentralEntry {
  nameBytes: Uint8Array
  crc: number
  compressedSize: number
  uncompressedSize: number
  method: number
  offset: number
  time: number
  date: number
}

/**
 * Builds a ZIP archive from a name → bytes map. Names use forward slashes and
 * must be unique. Returns the complete archive bytes.
 */
export function buildZip(files: Record<string, Uint8Array>, now: Date = new Date()): Uint8Array {
  const { time, date } = dosDateTime(now)
  const chunks: Uint8Array[] = []
  const central: CentralEntry[] = []
  let offset = 0

  for (const [name, data] of Object.entries(files)) {
    const nameBytes = new TextEncoder().encode(name)
    const crc = crc32(data)
    const deflated = deflateRawSync(data)
    // Use stored (method 0) when deflate doesn't actually shrink the data.
    const useDeflate = deflated.length < data.length
    const body = useDeflate ? new Uint8Array(deflated) : data
    const method = useDeflate ? 8 : 0

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true) // local file header signature
    local.setUint16(4, 20, true) // version needed
    local.setUint16(6, 0, true) // flags
    local.setUint16(8, method, true)
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, body.length, true) // compressed size
    local.setUint32(22, data.length, true) // uncompressed size
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true) // extra field length

    chunks.push(new Uint8Array(local.buffer), nameBytes, body)
    central.push({
      nameBytes,
      crc,
      compressedSize: body.length,
      uncompressedSize: data.length,
      method,
      offset,
      time,
      date
    })
    offset += 30 + nameBytes.length + body.length
  }

  const centralStart = offset
  let centralSize = 0
  for (const entry of central) {
    const header = new DataView(new ArrayBuffer(46))
    header.setUint32(0, 0x02014b50, true) // central directory signature
    header.setUint16(4, 20, true) // version made by
    header.setUint16(6, 20, true) // version needed
    header.setUint16(8, 0, true) // flags
    header.setUint16(10, entry.method, true)
    header.setUint16(12, entry.time, true)
    header.setUint16(14, entry.date, true)
    header.setUint32(16, entry.crc, true)
    header.setUint32(20, entry.compressedSize, true)
    header.setUint32(24, entry.uncompressedSize, true)
    header.setUint16(28, entry.nameBytes.length, true)
    header.setUint16(30, 0, true) // extra length
    header.setUint16(32, 0, true) // comment length
    header.setUint16(34, 0, true) // disk number start
    header.setUint16(36, 0, true) // internal attrs
    header.setUint32(38, 0, true) // external attrs
    header.setUint32(42, entry.offset, true) // local header offset

    chunks.push(new Uint8Array(header.buffer), entry.nameBytes)
    centralSize += 46 + entry.nameBytes.length
  }

  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true) // end of central directory signature
  end.setUint16(4, 0, true) // disk number
  end.setUint16(6, 0, true) // central dir disk
  end.setUint16(8, central.length, true) // entries on this disk
  end.setUint16(10, central.length, true) // total entries
  end.setUint32(12, centralSize, true)
  end.setUint32(16, centralStart, true)
  end.setUint16(20, 0, true) // comment length
  chunks.push(new Uint8Array(end.buffer))

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const chunk of chunks) {
    out.set(chunk, pos)
    pos += chunk.length
  }
  return out
}
