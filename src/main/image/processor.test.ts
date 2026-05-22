import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extendBleed, finalizeUpscaled } from './processor'

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
