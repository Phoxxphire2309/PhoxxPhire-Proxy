import { readFile, rm } from 'node:fs/promises'
import sharp from 'sharp'
import type { BleedMode, ColorProfile } from '@shared/layout'
import { MPC_BLEED_PX, MPC_IMAGE_HEIGHT, MPC_IMAGE_WIDTH } from '@shared/mpc'
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from '@shared/units'

const JPEG_QUALITY = 85

/**
 * Adjusts card art for a target printer. Home printers reproduce colour poorly:
 * inkjets print dark and desaturated (so we lift saturation + brightness), laser
 * output is flat (so we push saturation harder and add a light sharpen). 'none'
 * returns the input unchanged.
 */
export async function applyColorProfile(
  imageBytes: Uint8Array,
  profile: ColorProfile
): Promise<Uint8Array> {
  if (profile === 'none') return imageBytes

  const pipeline = sharp(imageBytes, { limitInputPixels: false })
  if (profile === 'inkjet') {
    pipeline.modulate({ saturation: 1.12, brightness: 1.05 })
  } else {
    pipeline.modulate({ saturation: 1.18 }).sharpen({ sigma: 0.6 })
  }
  const out = await pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer()
  return new Uint8Array(out)
}

export interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * Samples the dominant border colour of a card image: it tallies the opaque
 * pixels just inside each edge (skipping the transparent rounded corners),
 * quantises them into coarse buckets, and returns the average of the most common
 * bucket. This yields the card's actual border colour — black, white, silver, or
 * the dominant edge tone of a borderless/full-art card — so corner-fill and
 * bleed work for arbitrary borders.
 */
export async function sampleBorderColor(imageBytes: Uint8Array): Promise<Rgb> {
  const { data, info } = await sharp(imageBytes, { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: c } = info
  if (!w || !h) return { r: 0, g: 0, b: 0 }

  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>()
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * c
    if (data[i + 3]! < 200) return // skip transparent rounded-corner pixels
    const key = `${data[i]! >> 4}|${data[i + 1]! >> 4}|${data[i + 2]! >> 4}`
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bucket.n += 1
    bucket.r += data[i]!
    bucket.g += data[i + 1]!
    bucket.b += data[i + 2]!
    buckets.set(key, bucket)
  }
  // Sample a ring a touch inside the edge to dodge the antialiased outline.
  const inset = Math.max(1, Math.round(Math.min(w, h) * 0.01))
  for (let x = 0; x < w; x += 1) {
    push(x, inset)
    push(x, h - 1 - inset)
  }
  for (let y = 0; y < h; y += 1) {
    push(inset, y)
    push(w - 1 - inset, y)
  }

  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket
  if (!best) return { r: 0, g: 0, b: 0 }
  return {
    r: Math.round(best.r / best.n),
    g: Math.round(best.g / best.n),
    b: Math.round(best.b / best.n)
  }
}

/**
 * Squares off the transparent rounded corners of a card image by compositing it
 * over a solid canvas of its own sampled border colour — so a black-bordered
 * card gets black corners, a white-bordered card white, and a borderless card
 * its dominant edge tone. This matches the printed card's border instead of
 * leaving the black (transparent-flattened) corners. A no-op for images without
 * an alpha channel (already square).
 */
export async function squareOffCorners(imageBytes: Uint8Array): Promise<Uint8Array> {
  const meta = await sharp(imageBytes, { limitInputPixels: false }).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height || !meta.hasAlpha) return imageBytes

  const color = await sampleBorderColor(imageBytes)
  const out = await sharp({
    create: { width, height, channels: 3, background: color }
  })
    .composite([{ input: Buffer.from(imageBytes) }])
    .flatten({ background: color })
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
 * Adds a bleed border around a card. Corners are squared first (filled with the
 * sampled border colour). The border itself is then either:
 *  - 'solid'  — a flat band of the card's sampled border colour (the default;
 *               clean for any border, no streaks or mirror artifacts), or
 *  - 'extend' — each edge pixel replicated straight outward (carries edge art,
 *               but can streak on busy full-art edges).
 * Returns the input unchanged for 'zoom' mode or when there's no bleed (zoom
 * enlarges the card at layout time instead of adding a border).
 */
export async function extendBleed(
  imageBytes: Uint8Array,
  bleedMm: number,
  mode: BleedMode
): Promise<Uint8Array> {
  if (mode === 'zoom' || bleedMm <= 0) return imageBytes

  const squared = await squareOffCorners(imageBytes)
  const image = sharp(squared, { limitInputPixels: false })
  const meta = await image.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height) return imageBytes

  const left = Math.round((width * bleedMm) / CARD_WIDTH_MM)
  const top = Math.round((height * bleedMm) / CARD_HEIGHT_MM)
  if (left <= 0 && top <= 0) return new Uint8Array(squared)

  const extendOptions =
    mode === 'extend'
      ? { extendWith: 'copy' as const }
      : { extendWith: 'background' as const, background: await sampleBorderColor(squared) }

  const out = await image
    .extend({ top, bottom: top, left, right: left, ...extendOptions })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()
  return new Uint8Array(out)
}

/**
 * Renders a card face to MakePlayingCards' full-bleed spec: corners are squared,
 * the art is resized to the cut area, then a solid bleed of the card's sampled
 * border colour fills out the exact MPC pixel size (no white edges, no zoomed
 * crop, no mirror kaleidoscope).
 */
export async function buildMpcImage(imageBytes: Uint8Array): Promise<Uint8Array> {
  const cutWidth = MPC_IMAGE_WIDTH - MPC_BLEED_PX * 2
  const cutHeight = MPC_IMAGE_HEIGHT - MPC_BLEED_PX * 2
  const squared = await squareOffCorners(imageBytes)
  const resized = await sharp(squared, { limitInputPixels: false })
    .resize(cutWidth, cutHeight, { fit: 'fill' })
    .toBuffer()
  const out = await sharp(resized, { limitInputPixels: false })
    .extend({
      top: MPC_BLEED_PX,
      bottom: MPC_BLEED_PX,
      left: MPC_BLEED_PX,
      right: MPC_BLEED_PX,
      extendWith: 'background',
      background: await sampleBorderColor(resized)
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
