import { useEffect, useState } from 'react'
import { UPSCALE_MODELS } from '@shared/ipc'
import type { InstallPhase } from '@shared/upscaleInstall'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { toast } from '@renderer/state/toastStore'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

export function UpscaleControls(): React.JSX.Element {
  const available = useUpscaleStore((state) => state.available)
  const model = useUpscaleStore((state) => state.model)
  const scale = useUpscaleStore((state) => state.scale)
  const setSettings = useUpscaleStore((state) => state.setSettings)
  const loadSettings = useUpscaleStore((state) => state.loadSettings)

  const [cacheBytes, setCacheBytes] = useState<number | null>(null)
  const [cachePath, setCachePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [installPhase, setInstallPhase] = useState<InstallPhase | null>(null)

  const refreshCache = (): void => {
    window.phoxx
      .getCacheInfo()
      .then((info) => {
        setCacheBytes(info.bytes)
        setCachePath(info.path)
      })
      .catch(() => setCacheBytes(null))
  }

  useEffect(refreshCache, [])

  useEffect(() => window.phoxx.onUpscaleInstallProgress(setInstallPhase), [])

  const installUpscaler = async (): Promise<void> => {
    setInstallPhase('downloading')
    try {
      await window.phoxx.installUpscaler()
      await loadSettings()
      refreshCache()
      toast('Upscaler installed', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Install failed', 'error')
    } finally {
      setInstallPhase(null)
    }
  }

  if (available === false) {
    const labels: Record<InstallPhase, string> = {
      downloading: 'Downloading…',
      extracting: 'Extracting…',
      installing: 'Installing…',
      done: 'Finishing…'
    }
    return (
      <button
        className="toggle"
        type="button"
        onClick={() => void installUpscaler()}
        disabled={installPhase !== null}
        title="Download the Real-ESRGAN upscaler (~50 MB)"
      >
        {installPhase ? labels[installPhase] : 'Install upscaler'}
      </button>
    )
  }

  const runCacheOp = async (op: () => Promise<{ bytes: number; path: string }>): Promise<void> => {
    setBusy(true)
    try {
      const info = await op()
      setCacheBytes(info.bytes)
      setCachePath(info.path)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Cache operation failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="controls">
      <label className="controls__field">
        <span className="controls__label">Model</span>
        <select
          value={model}
          onChange={(event) => void setSettings({ model: event.target.value })}
          disabled={available !== true}
        >
          {UPSCALE_MODELS.map((name) => (
            <option key={name} value={name}>
              {name === 'realesrgan-x4plus-anime' ? 'Anime / illustration' : 'General'}
            </option>
          ))}
        </select>
      </label>

      <label className="controls__field">
        <span className="controls__label">Scale</span>
        <select
          value={scale}
          onChange={(event) => void setSettings({ scale: Number(event.target.value) })}
          disabled={available !== true}
        >
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      </label>

      <span
        className="controls__cache"
        title={cachePath ? `On-disk cache: ${cachePath}` : 'On-disk image cache'}
      >
        {cacheBytes === null ? '—' : formatBytes(cacheBytes)}
        <button
          type="button"
          className="controls__clear"
          onClick={() => void runCacheOp(() => window.phoxx.rebuildImageCache())}
          disabled={busy || cacheBytes === 0}
          title="Drop cached images so they re-download and re-process with the latest fixes (keeps your searched cards)"
        >
          Rebuild
        </button>
        <button
          type="button"
          className="controls__clear"
          onClick={() => void runCacheOp(() => window.phoxx.clearCache())}
          disabled={busy || cacheBytes === 0}
          title="Delete everything cached (images and card data)"
        >
          Clear
        </button>
      </span>
    </div>
  )
}
