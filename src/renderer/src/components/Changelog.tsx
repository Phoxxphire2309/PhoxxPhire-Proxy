import { useEffect } from 'react'
import { CHANGELOG } from '@shared/changelog'

// Only the newest entry is treated as unreleased ("Upcoming") when it has no
// date; an older entry with no date just shows nothing rather than "Upcoming".
function formatDate(date: string | null, isLatest: boolean): string {
  if (!date) return isLatest ? 'Upcoming' : ''
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

/** A simple "What's new" modal listing each version's friendly highlights. */
export function Changelog({ onClose }: { onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="What's new">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel import changelog">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">What’s new</h2>
        <div className="changelog__scroll">
          {CHANGELOG.map((entry, index) => {
            const date = formatDate(entry.date, index === 0)
            return (
              <section key={entry.version} className="changelog__entry">
                <div className="changelog__head">
                  <span className="changelog__version">Version {entry.version}</span>
                  {date && <span className="changelog__date">{date}</span>}
                </div>
                <ul className="changelog__list">
                  {entry.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
