import { join } from 'node:path'

/** Default Real-ESRGAN model and effective output scale. */
export const DEFAULT_MODEL = 'realesrgan-x4plus'
// 2× of source ≈ 600 DPI at card size — past what any printer resolves, and a
// quarter the file size of 4×. The binary still runs at 4×; sharp downscales.
export const DEFAULT_SCALE = 2

export interface VendorLocation {
  isPackaged: boolean
  /** `app.getAppPath()` — project root in dev. */
  appPath: string
  /** `process.resourcesPath` — only meaningful when packaged. */
  resourcesPath: string
}

/**
 * Locates the vendored upscaler directory. In development it sits in the repo
 * (`resources/vendor`); in a packaged build electron-builder copies it to the
 * app's resources directory via `extraResources`.
 */
export function vendorDir(location: VendorLocation): string {
  return location.isPackaged
    ? join(location.resourcesPath, 'vendor')
    : join(location.appPath, 'resources', 'vendor')
}

export function binaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan'
}

export function binaryPath(
  location: VendorLocation,
  platform: NodeJS.Platform = process.platform
): string {
  return join(vendorDir(location), binaryName(platform))
}

export function modelsDir(location: VendorLocation): string {
  return join(vendorDir(location), 'models')
}
