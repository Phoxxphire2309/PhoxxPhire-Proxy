import { spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { InstallPhase } from '@shared/upscaleInstall'
import { binaryName } from './paths'

const RELEASE = 'v0.2.5.0'
const BASE = `https://github.com/xinntao/Real-ESRGAN/releases/download/${RELEASE}`

const ASSETS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'realesrgan-ncnn-vulkan-20220424-macos.zip',
  win32: 'realesrgan-ncnn-vulkan-20220424-windows.zip',
  linux: 'realesrgan-ncnn-vulkan-20220424-ubuntu.zip'
}

/** The upstream release asset for a platform, or null if unsupported. */
export function assetForPlatform(platform: NodeJS.Platform): string | null {
  return ASSETS[platform] ?? null
}

async function find(
  root: string,
  predicate: (entry: { name: string; isFile: () => boolean; isDirectory: () => boolean }) => boolean
): Promise<string | null> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (predicate(entry)) return full
    if (entry.isDirectory()) {
      const nested = await find(full, predicate)
      if (nested) return nested
    }
  }
  return null
}

function extract(zipPath: string, destDir: string): void {
  const result =
    process.platform === 'win32'
      ? spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
          ],
          { stdio: 'ignore' }
        )
      : spawnSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'ignore' })
  if (result.status !== 0) {
    throw new Error('Could not extract the upscaler archive.')
  }
}

/**
 * Downloads + installs the Real-ESRGAN binary and models into `vendorDir`.
 * `fetchFn` is injectable for testing.
 */
export async function installUpscaler(
  vendorDir: string,
  onPhase: (phase: InstallPhase) => void,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  const asset = assetForPlatform(process.platform)
  if (!asset) throw new Error(`Upscaler is not available for platform ${process.platform}.`)

  await mkdir(vendorDir, { recursive: true })
  const work = await mkdtemp(join(tmpdir(), 'phoxx-upscaler-'))
  const zipPath = join(work, asset)

  try {
    onPhase('downloading')
    const response = await fetchFn(`${BASE}/${asset}`, { redirect: 'follow' })
    if (!response.ok || !response.body) {
      throw new Error(`Download failed (HTTP ${response.status}).`)
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(zipPath))

    onPhase('extracting')
    const extractDir = join(work, 'unzipped')
    await mkdir(extractDir, { recursive: true })
    extract(zipPath, extractDir)

    const foundBinary = await find(extractDir, (e) => e.isFile() && e.name === binaryName())
    const foundModels = await find(extractDir, (e) => e.isDirectory() && e.name === 'models')
    if (!foundBinary || !foundModels) {
      throw new Error('The archive did not contain the expected binary and models.')
    }

    onPhase('installing')
    const target = join(vendorDir, binaryName())
    await cp(foundBinary, target)
    await cp(foundModels, join(vendorDir, 'models'), { recursive: true })
    // Windows needs the Vulkan loader DLL(s) alongside the executable to run.
    if (process.platform === 'win32') {
      const binDir = dirname(foundBinary)
      for (const entry of await readdir(binDir)) {
        if (entry.toLowerCase().endsWith('.dll')) {
          await cp(join(binDir, entry), join(vendorDir, entry))
        }
      }
    }
    if (process.platform !== 'win32') spawnSync('chmod', ['+x', target])
    if (process.platform === 'darwin') {
      spawnSync('xattr', ['-dr', 'com.apple.quarantine', vendorDir])
    }

    onPhase('done')
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
