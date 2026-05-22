import { rm } from 'node:fs/promises'
import sharp from 'sharp'
import type { BleedMode } from '@shared/layout'
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from '@shared/units'

const JPEG_QUALITY = 85

/**
 * Finalises an upscaled image. The Real-ESRGAN binary always runs at a clean 4×
 * (its `-s 2` path corrupts output), so here we downscale to the requested
 * effective scale and re-encode as JPEG — far smaller than lossless PNG with no
 * visible loss for card art. The temporary PNG is removed.
 */
export async function finalizeUpscaled(
  tmpPngPath: string,
  destPath: string,
  scale: number
): Promise<void> {
  const image = sharp(tmpPngPath, { limitInputPixels: false })
  const meta = await image.metadata()
  const width = meta.width ?? 0
  const pipeline =
    scale < 4 && width > 0 ? image.resize({ width: Math.round((width * scale) / 4) }) : image
  await pipeline.jpeg({ quality: JPEG_QUALITY }).toFile(destPath)
  await rm(tmpPngPath, { force: true })
}

/**
 * Adds a mirrored bleed border so a printed card has real bleed content (rather
 * than a zoomed card or a white edge). Returns the input unchanged for the
 * 'zoom' mode or when there is no bleed.
 */
export async function extendBleed(
  imageBytes: Uint8Array,
  bleedMm: number,
  mode: BleedMode
): Promise<Uint8Array> {
  if (mode !== 'extend' || bleedMm <= 0) return imageBytes

  const image = sharp(imageBytes, { limitInputPixels: false })
  const meta = await image.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height) return imageBytes

  const left = Math.round((width * bleedMm) / CARD_WIDTH_MM)
  const top = Math.round((height * bleedMm) / CARD_HEIGHT_MM)
  const out = await image
    .extend({ top, bottom: top, left, right: left, extendWith: 'mirror' })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()
  return new Uint8Array(out)
}
