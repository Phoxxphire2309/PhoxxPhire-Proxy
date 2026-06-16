import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MPC_BLEED_PX, MPC_IMAGE_HEIGHT, MPC_IMAGE_WIDTH } from '@shared/mpc'
import {
  applyColorProfile,
  buildMpcCardBack,
  buildMpcImage,
  extendBleed,
  finalizeUpscaled,
  sampleBorderColor,
  squareOffCorners
} from './processor'

/** A card-like image: an opaque coloured border around a different-coloured interior. */
async function borderedPng(
  border: { r: number; g: number; b: number },
  interior: { r: number; g: number; b: number },
  w = 630,
  h = 880,
  borderPx = 40
): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const edge = x < borderPx || y < borderPx || x >= w - borderPx || y >= h - borderPx
      const px = edge ? border : interior
      const i = (y * w + x) * 3
      raw[i] = px.r
      raw[i + 1] = px.g
      raw[i + 2] = px.b
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer()
}

const isPng = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47

const isJpeg = (bytes: Uint8Array): boolean => bytes[0] === 0xff && bytes[1] === 0xd8

async function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } }
  })
    .png()
    .toBuffer()
}

describe('finalizeUpscaled', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-proc-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('downscales a 4× PNG to the requested scale, writes JPEG, and removes the temp', async () => {
    const tmp = join(dir, 'tmp.png')
    const dest = join(dir, 'out.jpg')
    await writeFile(tmp, await solidPng(400, 560)) // a "4×" image

    await finalizeUpscaled(tmp, dest, 2) // → 2× = half size

    const out = await readFile(dest)
    expect(isJpeg(new Uint8Array(out))).toBe(true)
    expect((await sharp(dest).metadata()).width).toBe(200)
    await expect(access(tmp)).rejects.toThrow() // temp deleted
  })

  it('keeps full size at scale 4', async () => {
    const tmp = join(dir, 'tmp.png')
    const dest = join(dir, 'out.jpg')
    await writeFile(tmp, await solidPng(400, 560))
    await finalizeUpscaled(tmp, dest, 4)
    expect((await sharp(dest).metadata()).width).toBe(400)
  })
})

describe('squareOffCorners', () => {
  it('drops the white-matte corner fringe instead of leaving a pale halo', async () => {
    // Real card PNGs store transparent corners as white RGB; the rounded edge has
    // a partly-transparent white fringe. Build that: a dark-red "card" whose
    // top-left corner is transparent white (matte) with a half-alpha fringe ring.
    const N = 80
    const raw = Buffer.alloc(N * N * 4)
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const i = (y * N + x) * 4
        const d = x + y // anti-diagonal distance from the top-left corner
        const [r, g, b, a] =
          d < 6 ? [255, 255, 255, 0] : d < 10 ? [255, 255, 255, 128] : [200, 30, 30, 255]
        raw[i] = r
        raw[i + 1] = g
        raw[i + 2] = b
        raw[i + 3] = a
      }
    }
    const png = await sharp(raw, { raw: { width: N, height: N, channels: 4 } })
      .png()
      .toBuffer()
    const { data, info } = await sharp(await squareOffCorners(new Uint8Array(png)))
      .raw()
      .toBuffer({ resolveWithObject: true })
    // A pixel that was the white fringe (x=y=4) must now show the red corner fill,
    // not a pale white/red blend — i.e. green stays low (red), not ~140 (halo).
    const i = (4 * info.width + 4) * info.channels
    expect(data[i + 1]).toBeLessThan(100) // green low → red fill, no white halo
    expect(data[i]).toBeGreaterThan(120) // red present
  })
})

describe('extendBleed', () => {
  it('adds an edge-replicated border sized to the bleed in extend mode', async () => {
    const png = await solidPng(630, 880) // 10px per mm at card size
    const out = await extendBleed(new Uint8Array(png), 2, 'extend')
    const meta = await sharp(out).metadata()
    // 2mm bleed each side → ~20px horizontally, ~20px vertically.
    expect(meta.width).toBe(630 + 2 * 20)
    expect(meta.height).toBe(880 + 2 * 20)
    expect(isJpeg(out)).toBe(true)
  })

  it('replicates the edge outward (not a mirror reflection) into the bleed', async () => {
    // A white stripe along the very left edge, black everywhere else. Edge
    // replication carries the white edge across the whole left bleed; a mirror
    // would reflect the black interior outward instead, leaving the outer bleed
    // dark. Sampling the outermost bleed column distinguishes the two.
    const W = 630
    const H = 880
    const raw = Buffer.alloc(W * H * 3)
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const v = x < 3 ? 255 : 0
        const i = (y * W + x) * 3
        raw[i] = v
        raw[i + 1] = v
        raw[i + 2] = v
      }
    }
    const png = await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toBuffer()
    const out = await extendBleed(new Uint8Array(png), 2, 'extend')
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true })

    let sum = 0
    for (let y = 0; y < info.height; y += 1) sum += data[(y * info.width + 0) * info.channels]!
    const leftEdgeMean = sum / info.height
    expect(leftEdgeMean).toBeGreaterThan(150) // bright: the edge was replicated, not reflected
  })

  it('fills the bleed with the sampled border colour in solid mode', async () => {
    // Red border, blue interior. The solid bleed should be the red border colour.
    const png = await borderedPng({ r: 210, g: 30, b: 30 }, { r: 20, g: 40, b: 200 })
    const out = await extendBleed(new Uint8Array(png), 2, 'solid')
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    const r = data[0]!
    const g = data[1]!
    const b = data[2]!
    expect(r).toBeGreaterThan(150) // outer bleed pixel is the red border, not the blue interior
    expect(r).toBeGreaterThan(g + b)
  })

  it('squares transparent rounded corners using the border colour, not interior art', async () => {
    // Black border, grey interior, transparent top-left corner. The squared
    // corner must take the BLACK border colour, never the grey interior.
    const W = 630
    const H = 880
    const border = 40
    const raw = Buffer.alloc(W * H * 4)
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4
        const transparent = x < W * 0.03 && y < H * 0.03
        const edge = x < border || y < border || x >= W - border || y >= H - border
        const v = edge ? 0 : 160 // black border, grey interior
        raw[i] = v
        raw[i + 1] = v
        raw[i + 2] = v
        raw[i + 3] = transparent ? 0 : 255
      }
    }
    const png = await sharp(raw, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toBuffer()
    const out = await extendBleed(new Uint8Array(png), 2, 'solid')
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true })

    // Outermost top-left bleed pixel should be black (the border), well below grey (160).
    expect(data[0]!).toBeLessThan(60)
  })

  it('returns the input unchanged for zoom mode or zero bleed', async () => {
    const bytes = new Uint8Array(await solidPng(10, 14))
    expect(await extendBleed(bytes, 2, 'zoom')).toBe(bytes)
    expect(await extendBleed(bytes, 0, 'solid')).toBe(bytes)
  })
})

describe('sampleBorderColor', () => {
  it('returns the dominant border colour, ignoring the interior', async () => {
    const black = await sampleBorderColor(
      new Uint8Array(await borderedPng({ r: 0, g: 0, b: 0 }, { r: 200, g: 200, b: 200 }))
    )
    expect(black.r).toBeLessThan(30)
    expect(black.g).toBeLessThan(30)
    expect(black.b).toBeLessThan(30)

    const red = await sampleBorderColor(
      new Uint8Array(await borderedPng({ r: 210, g: 20, b: 20 }, { r: 20, g: 20, b: 210 }))
    )
    expect(red.r).toBeGreaterThan(150)
    expect(red.b).toBeLessThan(80)
  })
})

describe('buildMpcImage', () => {
  it('renders to the full MPC bleed PNG dimensions regardless of input size', async () => {
    const out = await buildMpcImage(new Uint8Array(await solidPng(100, 140)))
    const meta = await sharp(out).metadata()
    expect(isPng(out)).toBe(true)
    expect(meta.width).toBe(MPC_IMAGE_WIDTH)
    expect(meta.height).toBe(MPC_IMAGE_HEIGHT)
  })

  it('reserves the configured bleed on each side around the cut area', async () => {
    const out = await buildMpcImage(new Uint8Array(await solidPng(745, 1040)))
    const meta = await sharp(out).metadata()
    expect((meta.width ?? 0) - 2 * MPC_BLEED_PX).toBe(MPC_IMAGE_WIDTH - 2 * MPC_BLEED_PX)
    expect((meta.height ?? 0) - 2 * MPC_BLEED_PX).toBe(MPC_IMAGE_HEIGHT - 2 * MPC_BLEED_PX)
  })
})

describe('applyColorProfile', () => {
  it('returns the exact same bytes for the none profile', async () => {
    const bytes = new Uint8Array(await solidPng(60, 80))
    expect(await applyColorProfile(bytes, 'none')).toBe(bytes)
  })

  it('boosts saturation for inkjet and laser, changing the pixels', async () => {
    // A muted mid-colour so a saturation boost is measurable.
    const base = await sharp({
      create: { width: 60, height: 80, channels: 3, background: { r: 150, g: 90, b: 90 } }
    })
      .png()
      .toBuffer()
    const original = (await sharp(base).raw().toBuffer())[0]!

    for (const profile of ['inkjet', 'laser'] as const) {
      const out = await applyColorProfile(new Uint8Array(base), profile)
      expect(isJpeg(out)).toBe(true)
      const meta = await sharp(out).metadata()
      expect(meta.width).toBe(60)
      expect(meta.height).toBe(80)
      // Saturation lift pushes the dominant red channel higher.
      const r = (await sharp(out).raw().toBuffer())[0]!
      expect(r).toBeGreaterThanOrEqual(original)
    }
  })
})

describe('buildMpcCardBack', () => {
  it('produces a PNG at the full MPC bleed dimensions', async () => {
    const back = await buildMpcCardBack()
    const meta = await sharp(back).metadata()
    expect(isPng(back)).toBe(true)
    expect(meta.width).toBe(MPC_IMAGE_WIDTH)
    expect(meta.height).toBe(MPC_IMAGE_HEIGHT)
  })
})
