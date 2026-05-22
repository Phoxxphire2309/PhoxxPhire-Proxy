import { useUpscaleStore } from '@renderer/state/upscaleStore'

export function UpscaleProgress(): React.JSX.Element | null {
  const job = useUpscaleStore((state) => state.job)
  if (!job) return null

  const percent = job.total === 0 ? 0 : (job.done / job.total) * 100

  return (
    <div className="upscale-progress" role="status" aria-live="polite">
      <div className="upscale-progress__panel">
        <p className="upscale-progress__label">Upscaling…</p>
        <div className="upscale-progress__bar">
          <div className="upscale-progress__fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="upscale-progress__count">
          {job.done}/{job.total}
        </p>
      </div>
    </div>
  )
}
