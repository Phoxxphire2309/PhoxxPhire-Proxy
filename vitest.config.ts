import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/shared/**/*.ts',
        'src/main/scryfall/rate-limiter.ts',
        'src/main/scryfall/normalize.ts',
        'src/main/scryfall/client.ts',
        'src/main/scryfall/deck-sources.ts',
        'src/main/upscale/semaphore.ts',
        'src/main/upscale/upscaler.ts',
        'src/main/upscale/paths.ts',
        'src/main/upscale/service.ts',
        'src/main/export/pdf.ts',
        'src/main/export/service.ts',
        'src/main/export/calibration.ts',
        'src/main/image/processor.ts'
      ],
      exclude: ['src/shared/**/*.d.ts', 'src/shared/ipc.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
})
