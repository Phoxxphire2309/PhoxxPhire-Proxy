import { describe, expect, it } from 'vitest'
import { binaryName, binaryPath, modelsDir, vendorDir } from './paths'

describe('upscaler paths', () => {
  it('uses resources/vendor in development and resourcesPath when packaged', () => {
    const dev = { isPackaged: false, appPath: '/repo', resourcesPath: '/ignored' }
    const packaged = { isPackaged: true, appPath: '/ignored', resourcesPath: '/app/Resources' }
    expect(vendorDir(dev)).toBe('/repo/resources/vendor')
    expect(vendorDir(packaged)).toBe('/app/Resources/vendor')
  })

  it('appends .exe only on Windows', () => {
    expect(binaryName('darwin')).toBe('realesrgan-ncnn-vulkan')
    expect(binaryName('linux')).toBe('realesrgan-ncnn-vulkan')
    expect(binaryName('win32')).toBe('realesrgan-ncnn-vulkan.exe')
  })

  it('derives binary and models paths from the vendor dir', () => {
    const dev = { isPackaged: false, appPath: '/repo', resourcesPath: '' }
    expect(binaryPath(dev, 'darwin')).toBe('/repo/resources/vendor/realesrgan-ncnn-vulkan')
    expect(modelsDir(dev)).toBe('/repo/resources/vendor/models')
  })
})
