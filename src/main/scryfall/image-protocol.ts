import { readFile } from 'node:fs/promises'
import { protocol } from 'electron'
import { IMAGE_PROTOCOL, type ImageQuality } from '@shared/scryfall'

/** Resolves a card face + quality to a local image file path, producing it if needed. */
export interface FaceImageResolver {
  resolve(cardId: string, faceIndex: number, quality: ImageQuality): Promise<string>
}

/** Resolves an MPCFill Drive image + quality to a local image file path. */
export interface MpcfillImageResolver {
  resolveMpcfill(identifier: string, quality: ImageQuality): Promise<string>
}

/**
 * Must run before `app.whenReady()`. Registers our image scheme as a standard,
 * secure scheme so the renderer can reference it from `<img>` under a strict CSP.
 */
export function registerImageProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: IMAGE_PROTOCOL,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

function parseQuality(value: string | undefined): ImageQuality | null {
  if (value === undefined || value === 'upscaled') return 'upscaled'
  if (value === 'source') return 'source'
  if (value === 'thumb') return 'thumb'
  if (value === 'proxy') return 'proxy'
  return null
}

/**
 * Resolves the local image file for a request URL, by host:
 *  - `phoxx-image://card/<id>/<face>/<quality>` — a Scryfall card face,
 *  - `phoxx-image://mpcfill/<identifier>/<quality>` — an MPCFill Drive image.
 * Returns null for a malformed/unknown request.
 */
function resolveRequest(
  url: URL,
  card: FaceImageResolver,
  mpcfill: MpcfillImageResolver
): Promise<string> | null {
  const segments = url.pathname.split('/')
  if (url.host === 'card') {
    const [, idRaw, faceRaw, qualityRaw] = segments
    const faceIndex = Number(faceRaw)
    const quality = parseQuality(qualityRaw)
    if (!idRaw || !Number.isInteger(faceIndex) || faceIndex < 0 || !quality) return null
    return card.resolve(decodeURIComponent(idRaw), faceIndex, quality)
  }
  if (url.host === 'mpcfill') {
    const [, idRaw, qualityRaw] = segments
    const quality = parseQuality(qualityRaw)
    if (!idRaw || !quality) return null
    return mpcfill.resolveMpcfill(decodeURIComponent(idRaw), quality)
  }
  return null
}

/**
 * Handles `phoxx-image://` requests by resolving them (per host) to a cached
 * (and, for `upscaled`, super-resolved) image file.
 */
export function handleImageProtocol(card: FaceImageResolver, mpcfill: MpcfillImageResolver): void {
  protocol.handle(IMAGE_PROTOCOL, async (request) => {
    const url = new URL(request.url)
    if (url.host !== 'card' && url.host !== 'mpcfill') {
      return new Response('Unknown image resource', { status: 404 })
    }

    const pending = resolveRequest(url, card, mpcfill)
    if (!pending) {
      return new Response('Malformed image request', { status: 400 })
    }

    try {
      const filePath = await pending
      const data = await readFile(filePath)
      const isJpeg = data[0] === 0xff && data[1] === 0xd8
      return new Response(new Uint8Array(data), {
        headers: {
          'Content-Type': isJpeg ? 'image/jpeg' : 'image/png',
          'Cache-Control': 'no-cache'
        }
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error'
      return new Response(`Image unavailable: ${reason}`, { status: 502 })
    }
  })
}
