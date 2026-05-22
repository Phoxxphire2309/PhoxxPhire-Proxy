import { access } from 'node:fs/promises'
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
  /** `app.getPath('userData')` — writable location for in-app installs. */
  userDataDir: string
}

export interface ResolvedVendor {
  binary: string
  models: string
}

export function binaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan'
}

/** Writable directory the one-click installer downloads into. */
export function installVendorDir(location: VendorLocation): string {
  return join(location.userDataDir, 'vendor')
}

/**
 * Candidate vendor directories, in priority order: a user-installed copy first,
 * then the dev repo copy, then the packaged (extraResources) copy.
 */
function candidateVendorDirs(location: VendorLocation): string[] {
  return [
    installVendorDir(location),
    join(location.appPath, 'resources', 'vendor'),
    join(location.resourcesPath, 'vendor')
  ]
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Returns the first vendor location that actually contains the binary, or null. */
export async function resolveVendor(
  location: VendorLocation,
  platform: NodeJS.Platform = process.platform
): Promise<ResolvedVendor | null> {
  for (const dir of candidateVendorDirs(location)) {
    const binary = join(dir, binaryName(platform))
    if (await exists(binary)) {
      return { binary, models: join(dir, 'models') }
    }
  }
  return null
}
