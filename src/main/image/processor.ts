import { readFile, rm } from 'node:fs/promises'
import sharp from 'sharp'
import type { BleedMode } from '@shared/layout'
import { MPC_BLEED_PX, MPC_IMAGE_HEIGHT, MPC_IMAGE_WIDTH } from '@shared/mpc'
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from '@shared/units'

const JPEG_QUALITY = 85

/**
 * Scryfall card PNGs have transparent rounded corners. Re-encoding to JPEG would
 * flatten those to black (and bleed extension then replicates the black into the
 * corners). This fills the transparent rounding with the card's *nearest edge*
 * colour by propagating opaque pixels inward one ring at a time — so a black
 * corner stays black and a bright corner stays bright, never pulling in distant
 * interior art. A no-op for images without an alpha channel.
 */
export async function squareOffCorners(imageBytes: Uint8Array): Promise<Uint8Array> {
  const base = sharp(imageBytes, { limitInputPixels: false })
  const meta = await base.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height || !meta.hasAlpha) return imageBytes

  const { data } = await base.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const opaque = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i += 1) opaque[i] = data[i * 4 + 3]! > 128 ? 1 : 0

  // The transparent area is only the small corner curves; propagating the edge
  // inward by a little over the corner radius (~4% of the card) fills them.
  const maxPasses = Math.ceil(Math.max(width, height) * 0.05)
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x
        if (opaque[p]) continue
        let n = -1
        if (x > 0 && opaque[p - 1]) n = p - 1
        else if (x < width - 1 && opaque[p + 1]) n = p + 1
        else if (y > 0 && opaque[p - width]) n = p - width
        else if (y < height - 1 && opaque[p + width]) n = p + width
        if (n >= 0) {
          data[p * 4] = data[n * 4]!
          data[p * 4 + 1] = data[n * 4 + 1]!
          data[p * 4 + 2] = data[n * 4 + 2]!
          opaque[p] = 1
          changed = true
        }
      }
    }
    if (!changed) break
  }

  const out = await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
    .removeAlpha()
    .png()
    .toBuffer()
  return new Uint8Array(out)
}

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
  const squared = await squareOffCorners(new Uint8Array(await readFile(tmpPngPath)))
  const image = sharp(squared, { limitInputPixels: false })
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

  // Fill the transparent rounded corners with art first, so the bleed replicates
  // real colour outward instead of black.
  const squared = await squareOffCorners(imageBytes)
  const out = await sharp(squared, { limitInputPixels: false })
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
  const squared = await squareOffCorners(imageBytes)
  const out = await sharp(squared, { limitInputPixels: false })
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
