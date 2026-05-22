#!/usr/bin/env node
/**
 * Provisions the Real-ESRGAN ncnn/Vulkan binary + models into resources/vendor.
 *
 * Downloads the upstream release for the current platform, extracts it, and
 * copies the executable and `models/` directory into place. Idempotent: skips
 * if the binary already exists unless run with `--force`.
 *
 *   node scripts/fetch-upscaler.mjs [--force]
 */
import { spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { access, cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const RELEASE = 'v0.2.5.0'
const BASE = `https://github.com/xinntao/Real-ESRGAN/releases/download/${RELEASE}`
const ASSET = {
  darwin: 'realesrgan-ncnn-vulkan-20220424-macos.zip',
  win32: 'realesrgan-ncnn-vulkan-20220424-windows.zip',
  linux: 'realesrgan-ncnn-vulkan-20220424-ubuntu.zip'
}

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const vendorDir = join(projectRoot, 'resources', 'vendor')
const binaryName =
  process.platform === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan'
const force = process.argv.includes('--force')

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Recursively locate a file or directory matching `predicate`. */
async function find(root, predicate) {
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

function extract(zipPath, destDir) {
  const result =
    process.platform === 'win32'
      ? spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
          ],
          { stdio: 'inherit' }
        )
      : spawnSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`Extraction failed (exit ${result.status}). Is unzip/PowerShell available?`)
  }
}

async function main() {
  const asset = ASSET[process.platform]
  if (!asset) throw new Error(`Unsupported platform: ${process.platform}`)

  const target = join(vendorDir, binaryName)
  if (!force && (await exists(target))) {
    console.log(`Upscaler already present at ${target} (use --force to re-download).`)
    return
  }

  await mkdir(vendorDir, { recursive: true })
  const work = await mkdtemp(join(tmpdir(), 'phoxx-upscaler-'))
  const zipPath = join(work, asset)

  try {
    console.log(`Downloading ${asset} …`)
    const response = await fetch(`${BASE}/${asset}`, { redirect: 'follow' })
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status}`)
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(zipPath))

    console.log('Extracting …')
    const extractDir = join(work, 'unzipped')
    await mkdir(extractDir, { recursive: true })
    extract(zipPath, extractDir)

    const foundBinary = await find(extractDir, (e) => e.isFile() && e.name === binaryName)
    const foundModels = await find(extractDir, (e) => e.isDirectory() && e.name === 'models')
    if (!foundBinary) throw new Error(`Could not find ${binaryName} in the archive`)
    if (!foundModels) throw new Error('Could not find a models/ directory in the archive')

    await cp(foundBinary, target)
    await cp(foundModels, join(vendorDir, 'models'), { recursive: true })

    if (process.platform !== 'win32') {
      spawnSync('chmod', ['+x', target])
    }
    if (process.platform === 'darwin') {
      // Clear the Gatekeeper quarantine flag so the binary can run.
      spawnSync('xattr', ['-dr', 'com.apple.quarantine', vendorDir])
    }

    console.log(`Done. Upscaler installed at ${target}`)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`\nFailed to provision the upscaler: ${error.message}`)
  process.exitCode = 1
})
