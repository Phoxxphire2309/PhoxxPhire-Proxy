/**
 * Downloads an image's bytes, sending an accurate `User-Agent` and `Accept`.
 * Scryfall's CDN rejects generic/library agents (Node's default `node`) with
 * HTTP 400, and being explicit is good manners towards Google Drive too. Throws
 * on a non-2xx response; the caller decides how to surface that.
 */
export async function downloadImage(
  url: string,
  fetchFn: typeof fetch,
  userAgent: string,
  timeoutMs: number
): Promise<Uint8Array> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: { 'User-Agent': userAgent, Accept: 'image/*,*/*;q=0.8' }
    })
    if (!response.ok) {
      throw new Error(`Image download failed (HTTP ${response.status})`)
    }
    return new Uint8Array(await response.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

/** PNG (`89 50`) or JPEG (`FF D8`) magic bytes — i.e. real image data, not an
 * HTML error page (a Google Drive quota/interstitial response is `text/html`
 * served with HTTP 200, so the status check alone won't catch it). */
export function looksLikeImage(data: Uint8Array): boolean {
  return (
    (data[0] === 0x89 && data[1] === 0x50) || // PNG
    (data[0] === 0xff && data[1] === 0xd8) // JPEG
  )
}
