/** mana-font class for a single Scryfall cost symbol like W, 2, X, T, W/U, W/P. */
function symbolClass(token: string): string {
  const upper = token.toUpperCase()
  if (upper === 'T') return 'ms ms-tap ms-cost'
  if (upper === 'Q') return 'ms ms-untap ms-cost'
  // Hybrid/Phyrexian (e.g. "W/U", "2/W", "W/P") → ms-wu / ms-2w / ms-wp.
  const key = token.toLowerCase().replace(/\//g, '')
  return `ms ms-${key} ms-cost`
}

/** Renders a Scryfall mana-cost string (e.g. "{2}{W}{W}") as mana-font symbols. */
export function ManaCost({
  cost,
  className
}: {
  cost: string
  className?: string
}): React.JSX.Element | null {
  const tokens = [...cost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]!)
  if (tokens.length === 0) return null
  return (
    <span className={`manacost${className ? ` ${className}` : ''}`} aria-hidden="true">
      {tokens.map((token, index) => (
        <i key={`${token}-${index}`} className={symbolClass(token)} />
      ))}
    </span>
  )
}
