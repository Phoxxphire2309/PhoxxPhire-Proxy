/** A small fixed progress popup with a labelled bar and a done/total count. */
export function ProgressPopup({
  label,
  done,
  total
}: {
  label: string
  done: number
  total: number
}): React.JSX.Element {
  const percent = total === 0 ? 0 : (done / total) * 100
  return (
    <div className="upscale-progress" role="status" aria-live="polite">
      <div className="upscale-progress__panel">
        <p className="upscale-progress__label">{label}</p>
        <div className="upscale-progress__bar">
          <div className="upscale-progress__fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="upscale-progress__count">
          {done}/{total}
        </p>
      </div>
    </div>
  )
}
