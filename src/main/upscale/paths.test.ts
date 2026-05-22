import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { binaryName, installVendorDir, resolveVendor, type VendorLocation } from './paths'

describe('upscaler paths', () => {
  it('appends .exe only on Windows', () => {
    expect(binaryName('darwin')).toBe('realesrgan-ncnn-vulkan')
    expect(binaryName('linux')).toBe('realesrgan-ncnn-vulkan')
    expect(binaryName('win32')).toBe('realesrgan-ncnn-vulkan.exe')
  })

  it('puts the install dir under userData', () => {
    const location: VendorLocation = {
      isPackaged: false,
      appPath: '/repo',
      resourcesPath: '/res',
      userDataDir: '/data'
    }
    expect(installVendorDir(location)).toBe('/data/vendor')
  })
})

describe('resolveVendor', () => {
  let dir: string
  let location: VendorLocation

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-vendor-'))
    location = {
      isPackaged: false,
      appPath: join(dir, 'app'),
      resourcesPath: join(dir, 'res'),
      userDataDir: join(dir, 'data')
    }
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns null when no binary is present anywhere', async () => {
    expect(await resolveVendor(location, 'darwin')).toBeNull()
  })

  it('prefers the user-installed copy', async () => {
    const installed = installVendorDir(location)
    await mkdir(installed, { recursive: true })
    await writeFile(join(installed, 'realesrgan-ncnn-vulkan'), 'x')
    const resolved = await resolveVendor(location, 'darwin')
    expect(resolved?.binary).toBe(join(installed, 'realesrgan-ncnn-vulkan'))
    expect(resolved?.models).toBe(join(installed, 'models'))
  })

  it('falls back to the dev resources copy', async () => {
    const devVendor = join(location.appPath, 'resources', 'vendor')
    await mkdir(devVendor, { recursive: true })
    await writeFile(join(devVendor, 'realesrgan-ncnn-vulkan'), 'x')
    const resolved = await resolveVendor(location, 'darwin')
    expect(resolved?.binary).toBe(join(devVendor, 'realesrgan-ncnn-vulkan'))
  })
})
