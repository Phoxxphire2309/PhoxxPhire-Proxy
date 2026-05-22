import { useEffect, useState } from 'react'
import { UPSCALE_MODELS } from '@shared/ipc'
import { useUpscaleStore } from '@renderer/state/upscaleStore'

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
  const showSource = useUpscaleStore((state) => state.showSource)
  const toggleShowSource = useUpscaleStore((state) => state.toggleShowSource)
  const model = useUpscaleStore((state) => state.model)
  const scale = useUpscaleStore((state) => state.scale)
  const setSettings = useUpscaleStore((state) => state.setSettings)

  const [cacheBytes, setCacheBytes] = useState<number | null>(null)
  const [clearing, setClearing] = useState(false)

  const refreshCache = (): void => {
    window.phoxx
      .getCacheInfo()
      .then((info) => setCacheBytes(info.bytes))
      .catch(() => setCacheBytes(null))
  }

  useEffect(refreshCache, [])

  if (available === false) {
    return (
      <span className="app__note" title="Run: npm run setup:upscaler">
        Upscaler not installed — showing original art
      </span>
    )
  }

  const clearCache = async (): Promise<void> => {
    setClearing(true)
    try {
      const info = await window.phoxx.clearCache()
      setCacheBytes(info.bytes)
    } finally {
      setClearing(false)
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

      <button
        className={`toggle${showSource ? '' : ' is-on'}`}
        type="button"
        onClick={toggleShowSource}
        disabled={available !== true}
        aria-pressed={!showSource}
      >
        {showSource ? 'Original' : 'Upscaled'}
      </button>

      <span className="controls__cache" title="On-disk image cache">
        {cacheBytes === null ? '—' : formatBytes(cacheBytes)}
        <button
          type="button"
          className="controls__clear"
          onClick={() => void clearCache()}
          disabled={clearing || cacheBytes === 0}
        >
          Clear
        </button>
      </span>
    </div>
  )
}
