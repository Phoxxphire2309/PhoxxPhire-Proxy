import { rm } from 'node:fs/promises'
import sharp from 'sharp'
import type { BleedMode } from '@shared/layout'
import { MPC_BLEED_PX, MPC_IMAGE_HEIGHT, MPC_IMAGE_WIDTH } from '@shared/mpc'
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
 * Adds a bleed border by extending each edge pixel straight outward
 * (edge-replicate), so a printed card has real bleed content. Unlike a mirror
 * reflection, replication never duplicates edge features and never produces the
 * 4-fold "kaleidoscope" at corners (where a mirror reflects on both axes at
 * once). Returns the input unchanged for 'zoom' mode or when there's no bleed.
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
  if (left <= 0 && top <= 0) return imageBytes

  const out = await image
    .extend({ top, bottom: top, left, right: left, extendWith: 'copy' })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()
  return new Uint8Array(out)
}

/**
 * Renders a card face to MakePlayingCards' full-bleed spec: the art is resized
 * to the cut area, then an edge-replicated bleed border is added so the final
 * PNG is exactly MPC's expected pixel size (no white edges, no zoomed crop, and
 * no mirror kaleidoscope at the corners).
 */
export async function buildMpcImage(imageBytes: Uint8Array): Promise<Uint8Array> {
  const cutWidth = MPC_IMAGE_WIDTH - MPC_BLEED_PX * 2
  const cutHeight = MPC_IMAGE_HEIGHT - MPC_BLEED_PX * 2
  const out = await sharp(imageBytes, { limitInputPixels: false })
    .resize(cutWidth, cutHeight, { fit: 'fill' })
    .extend({
      top: MPC_BLEED_PX,
      bottom: MPC_BLEED_PX,
      left: MPC_BLEED_PX,
      right: MPC_BLEED_PX,
      extendWith: 'copy'
    })
    .png()
    .toBuffer()
  return new Uint8Array(out)
}

/**
 * A plain dark card back at MPC's full-bleed size, used as the common
 * `<cardback>` for single-faced cards. Users can replace the file afterwards.
 */
export async function buildMpcCardBack(): Promise<Uint8Array> {
  const out = await sharp({
    create: {
      width: MPC_IMAGE_WIDTH,
      height: MPC_IMAGE_HEIGHT,
      channels: 3,
      background: { r: 18, g: 19, b: 22 }
    }
  })
    .png()
    .toBuffer()
  return new Uint8Array(out)
}
