import { useEffect } from 'react'
import { useConfirmStore } from '@renderer/state/confirmStore'

/** Renders the active confirm/choice dialog (driven by the confirm store). */
export function ConfirmHost(): React.JSX.Element | null {
  const request = useConfirmStore((state) => state.request)
  const respond = useConfirmStore((state) => state.respond)

  useEffect(() => {
    if (!request) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') respond(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request, respond])

  if (!request) return null

  return (
    <div className="confirm" role="dialog" aria-modal="true" aria-label={request.title}>
      <button
        className="confirm__backdrop"
        type="button"
        aria-label="Dismiss"
        onClick={() => respond(null)}
      />
      <div className="confirm__panel">
        <h2 className="confirm__title">{request.title}</h2>
        {request.message && <p className="confirm__message">{request.message}</p>}
        <div className="confirm__actions">
          {request.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`confirm__button${option.primary ? ' confirm__button--primary' : ''}`}
              onClick={() => respond(option.id)}
            >
              {option.label}
            </button>
          ))}
          <button className="confirm__button" type="button" onClick={() => respond(null)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
