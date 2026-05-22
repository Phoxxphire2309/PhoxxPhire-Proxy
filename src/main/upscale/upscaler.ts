import { spawn } from 'node:child_process'
import { DEFAULT_MODEL, DEFAULT_SCALE } from './paths'

const DEFAULT_TIMEOUT_MS = 120_000

export interface UpscaleRequest {
  inputPath: string
  outputPath: string
  model?: string
  scale?: number
}

export interface UpscalerConfig {
  binaryPath: string
  modelsDir: string
  timeoutMs?: number
  spawnFn?: typeof spawn
}

/**
 * Builds the `realesrgan-ncnn-vulkan` argument list. Kept pure so the exact
 * invocation is easy to assert in tests.
 */
export function buildArgs(request: UpscaleRequest, modelsDir: string): string[] {
  return [
    '-i',
    request.inputPath,
    '-o',
    request.outputPath,
    '-s',
    String(request.scale ?? DEFAULT_SCALE),
    '-n',
    request.model ?? DEFAULT_MODEL,
    '-m',
    modelsDir,
    '-f',
    'png'
  ]
}

/** Thin wrapper that runs the Real-ESRGAN ncnn/Vulkan binary as a subprocess. */
export class Upscaler {
  private readonly binaryPath: string
  private readonly modelsDir: string
  private readonly timeoutMs: number
  private readonly spawnFn: typeof spawn

  constructor(config: UpscalerConfig) {
    this.binaryPath = config.binaryPath
    this.modelsDir = config.modelsDir
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.spawnFn = config.spawnFn ?? spawn
  }

  run(request: UpscaleRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = this.spawnFn(this.binaryPath, buildArgs(request, this.modelsDir))

      let stderr = ''
      let settled = false
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish(() => reject(new Error(`Upscale timed out after ${this.timeoutMs}ms`)))
      }, this.timeoutMs)

      // The binary streams progress to stderr; we only keep it for error reports.
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('error', (error) => finish(() => reject(error)))
      child.on('close', (code) => {
        if (code === 0) {
          finish(resolve)
        } else {
          finish(() =>
            reject(new Error(`Upscaler exited with code ${code}: ${stderr.trim().slice(-400)}`))
          )
        }
      })
    })
  }
}
