const TIPS: { title: string; body: string }[] = [
  {
    title: 'Search & build',
    body: 'Search Scryfall, click a card to add it, and switch printings or pick the highest-resolution scan from the card detail view.'
  },
  {
    title: 'Upscale the art',
    body: 'Run cards through Real-ESRGAN for sharper prints. Use the per-card or “Pre-upscale all” buttons.'
  },
  {
    title: 'Dial in your printer',
    body: 'In Page setup, set per-edge margins, bleed, a printer colour profile, and use the calibration page + scale % so cards trim to exactly 63×88 mm.'
  },
  {
    title: 'Export anywhere',
    body: 'Export a print-ready PDF, a ZIP of images, or a MakePlayingCards order. Mark proxies with the PROXY watermark if your playgroup requires it.'
  }
]

/** First-run welcome with a few orientation tips. */
export function Onboarding({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div
      className="detail"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to PhoxxPhire Proxy"
    >
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel import">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">Welcome to PhoxxPhire Proxy</h2>
        <p className="detail__hint">
          The proxy printer that AI-upscales every card before printing. A quick tour:
        </p>
        <ul className="onboard__list">
          {TIPS.map((tip) => (
            <li key={tip.title}>
              <strong>{tip.title}.</strong> {tip.body}
            </li>
          ))}
        </ul>
        <div className="import__actions">
          <button className="search__button" type="button" onClick={onClose}>
            Get started
          </button>
        </div>
      </div>
    </div>
  )
}
