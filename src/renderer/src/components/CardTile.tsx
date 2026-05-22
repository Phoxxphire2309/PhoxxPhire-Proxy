import { useEffect, useState } from 'react'
import { bestUsd, faceImageUrl, formatUsd, type Card } from '@shared/scryfall'
import { faceKey, useUpscaleStore } from '@renderer/state/upscaleStore'

function statusLabel(status: string | undefined, showingSource: boolean): string | null {
  if (showingSource) return 'Original'
  switch (status) {
    case 'queued':
    case 'upscaling':
      return 'Upscaling…'
    case 'ready':
      return '4× Real-ESRGAN'
    case 'failed':
      return 'Upscale failed'
    default:
      return null
  }
}

export function CardTile({
  card,
  onOpen,
  onAdd
}: {
  card: Card
  onOpen: () => void
  onAdd: () => void
}): React.JSX.Element {
  const [faceIndex, setFaceIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const showSource = useUpscaleStore((state) => state.showSource)
  const available = useUpscaleStore((state) => state.available)
  const settingsVersion = useUpscaleStore((state) => state.settingsVersion)
  const status = useUpscaleStore((state) => state.statuses[faceKey(card.id, faceIndex)])

  const showingSource = showSource || available === false
  const quality = showingSource ? 'source' : 'upscaled'
  const src = faceImageUrl(card.id, faceIndex, quality, showingSource ? undefined : settingsVersion)
  const isDoubleFaced = card.faces.length > 1
  const face = card.faces[faceIndex] ?? card.faces[0]
  const badge = statusLabel(status, showingSource)

  // Reset the loading state whenever the displayed image changes.
  useEffect(() => setLoaded(false), [src])

  return (
    <figure className="tile">
      <div
        className={`tile__art${loaded ? ' is-loaded' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`View ${card.name}`}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen()
          }
        }}
      >
        <img
          className="tile__img"
          src={src}
          alt={face?.name ?? card.name}
          loading="lazy"
          draggable={false}
          onLoad={() => setLoaded(true)}
        />
        {!loaded && <div className="tile__shimmer" aria-hidden="true" />}
        {badge && <span className={`tile__badge tile__badge--${status ?? 'src'}`}>{badge}</span>}
        <button
          className="tile__add"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onAdd()
          }}
          aria-label={`Add ${card.name} to deck`}
          title="Add to deck"
        >
          ＋
        </button>
        {isDoubleFaced && (
          <button
            className="tile__flip"
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setFaceIndex((index) => (index + 1) % card.faces.length)
            }}
            aria-label={`Flip ${card.name}`}
          >
            ⤺ Flip
          </button>
        )}
      </div>
      <figcaption className="tile__caption">
        <span className="tile__name">{face?.name ?? card.name}</span>
        <span className="tile__meta">
          {card.setCode.toUpperCase()} · #{card.collectorNumber} · {formatUsd(bestUsd(card.prices))}
        </span>
      </figcaption>
    </figure>
  )
}
