import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildZip } from './zip'

/**
 * Reads back a ZIP produced by buildZip by walking its local file headers,
 * decompressing each entry, and returning a name → bytes map. Validates exactly
 * the structure an unzip tool relies on to extract.
 */
function readZip(zip: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const files: Record<string, Uint8Array> = {}
  let offset = 0
  while (offset + 4 <= zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = new TextDecoder().decode(zip.subarray(nameStart, nameStart + nameLength))
    const dataStart = nameStart + nameLength + extraLength
    const body = zip.subarray(dataStart, dataStart + compressedSize)
    files[name] = method === 8 ? new Uint8Array(inflateRawSync(body)) : new Uint8Array(body)
    offset = dataStart + compressedSize
  }
  return files
}

function eocdCount(zip: Uint8Array): number {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  for (let i = zip.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) return view.getUint16(i + 10, true)
  }
  return -1
}

describe('buildZip', () => {
  it('round-trips text and binary entries with their exact bytes', () => {
    const files = {
      'a.txt': new TextEncoder().encode('hello world'),
      'sub/b.bin': new Uint8Array([0, 1, 2, 3, 255, 254, 0, 0, 42])
    }
    const back = readZip(buildZip(files))
    expect(Object.keys(back).sort()).toEqual(['a.txt', 'sub/b.bin'])
    expect(back['a.txt']).toEqual(files['a.txt'])
    expect(back['sub/b.bin']).toEqual(files['sub/b.bin'])
  })

  it('records the entry count in the end-of-central-directory record', () => {
    const zip = buildZip({ 'x.bin': new Uint8Array([1]), 'y.bin': new Uint8Array([2]) })
    expect(eocdCount(zip)).toBe(2)
  })

  it('round-trips highly compressible data (deflate path)', () => {
    const data = new Uint8Array(5000).fill(7)
    const zip = buildZip({ 'big.bin': data })
    // Deflate should shrink a long run, and it must still decompress exactly.
    expect(zip.length).toBeLessThan(data.length)
    expect(readZip(zip)['big.bin']).toEqual(data)
  })

  it('produces a valid empty archive', () => {
    expect(eocdCount(buildZip({}))).toBe(0)
  })
})
