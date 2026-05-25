import { readFile } from 'node:fs/promises'
import { protocol } from 'electron'
import { IMAGE_PROTOCOL, type ImageQuality } from '@shared/scryfall'

/** Resolves a card face + quality to a local image file path, producing it if needed. */
export interface FaceImageResolver {
  resolve(cardId: string, faceIndex: number, quality: ImageQuality): Promise<string>
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
 * Handles `phoxx-image://card/<id>/<face>/<quality>` requests by resolving them
 * to a cached (and, for `upscaled`, super-resolved) image file.
 */
export function handleImageProtocol(resolver: FaceImageResolver): void {
  protocol.handle(IMAGE_PROTOCOL, async (request) => {
    const url = new URL(request.url)
    if (url.host !== 'card') {
      return new Response('Unknown image resource', { status: 404 })
    }

    const [, idRaw, faceRaw, qualityRaw] = url.pathname.split('/')
    const faceIndex = Number(faceRaw)
    const quality = parseQuality(qualityRaw)
    if (!idRaw || !Number.isInteger(faceIndex) || faceIndex < 0 || !quality) {
      return new Response('Malformed image request', { status: 400 })
    }

    try {
      const filePath = await resolver.resolve(decodeURIComponent(idRaw), faceIndex, quality)
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
