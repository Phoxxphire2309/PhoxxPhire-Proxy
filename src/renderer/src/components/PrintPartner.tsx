import logo from '@renderer/assets/tcgplaytest-logo.png'

const PARTNER_URL = 'https://tcgplaytest.com'

/**
 * Print-partner credit pointing users who'd rather have professional prints to
 * TCGPlaytest.com. The link opens in the user's browser (the main process'
 * window-open handler routes `target="_blank"` to the default browser).
 *
 * `compact` renders a small header badge; the default renders the full card
 * (logo + wording) shown in the export dialog.
 */
export function PrintPartner({ compact = false }: { compact?: boolean }): React.JSX.Element {
  if (compact) {
    return (
      <a
        className="partner partner--compact"
        href={PARTNER_URL}
        target="_blank"
        rel="noreferrer"
        title="Order professional prints in the US at TCGPlaytest.com"
      >
        <img className="partner__logo" src={logo} alt="TCGPlaytest.com" />
        <span className="partner__compact-text">US prints — TCGPlaytest.com</span>
      </a>
    )
  }

  return (
    <a
      className="partner"
      href={PARTNER_URL}
      target="_blank"
      rel="noreferrer"
      title="Open TCGPlaytest.com in your browser"
    >
      <img className="partner__logo" src={logo} alt="TCGPlaytest.com" />
      <span className="partner__text">
        <span className="partner__lead">Want shop-quality printed proxies?</span>
        <span className="partner__sub">Our US print partner — order them at TCGPlaytest.com</span>
      </span>
    </a>
  )
}
