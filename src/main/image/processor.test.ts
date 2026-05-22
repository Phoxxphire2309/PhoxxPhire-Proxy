import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MPC_BLEED_PX, MPC_IMAGE_HEIGHT, MPC_IMAGE_WIDTH } from '@shared/mpc'
import { buildMpcCardBack, buildMpcImage, extendBleed, finalizeUpscaled } from './processor'

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

describe('extendBleed', () => {
  it('adds a mirrored border sized to the bleed in extend mode', async () => {
    const png = await solidPng(630, 880) // 10px per mm at card size
    const out = await extendBleed(new Uint8Array(png), 2, 'extend')
    const meta = await sharp(out).metadata()
    // 2mm bleed each side → ~20px horizontally, ~20px vertically.
    expect(meta.width).toBe(630 + 2 * 20)
    expect(meta.height).toBe(880 + 2 * 20)
    expect(isJpeg(out)).toBe(true)
  })

  it('returns the input unchanged for zoom mode or zero bleed', async () => {
    const bytes = new Uint8Array(await solidPng(10, 14))
    expect(await extendBleed(bytes, 2, 'zoom')).toBe(bytes)
    expect(await extendBleed(bytes, 0, 'extend')).toBe(bytes)
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

describe('buildMpcCardBack', () => {
  it('produces a PNG at the full MPC bleed dimensions', async () => {
    const back = await buildMpcCardBack()
    const meta = await sharp(back).metadata()
    expect(isPng(back)).toBe(true)
    expect(meta.width).toBe(MPC_IMAGE_WIDTH)
    expect(meta.height).toBe(MPC_IMAGE_HEIGHT)
  })
})
