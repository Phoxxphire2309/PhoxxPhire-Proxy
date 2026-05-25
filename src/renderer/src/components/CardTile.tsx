import { useEffect, useState } from 'react'
import { bestUsd, faceImageUrl, formatUsd, type Card } from '@shared/scryfall'
import { faceKey, useUpscaleStore } from '@renderer/state/upscaleStore'
import { upscaleCardWithConfirm } from '@renderer/state/upscaleActions'
import { useDndStore } from '@renderer/state/dndStore'
import { useTextProxyStore } from '@renderer/state/textProxyStore'

function statusBadge(status: string | undefined): string | null {
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

  const available = useUpscaleStore((state) => state.available) === true
  const upscaled = useUpscaleStore((state) => Boolean(state.upscaled[card.id]))
  const settingsVersion = useUpscaleStore((state) => state.settingsVersion)
  const unmarkUpscaled = useUpscaleStore((state) => state.unmarkUpscaled)
  const setDragging = useDndStore((state) => state.setDragging)
  const isProxy = useTextProxyStore((state) => Boolean(state.proxies[card.id]))
  const status = useUpscaleStore((state) => state.statuses[faceKey(card.id, faceIndex)])

  const quality = isProxy ? 'proxy' : upscaled ? 'upscaled' : 'thumb'
  const src = faceImageUrl(card.id, faceIndex, quality, upscaled ? settingsVersion : undefined)
  const isDoubleFaced = card.faces.length > 1
  const face = card.faces[faceIndex] ?? card.faces[0]
  const badge = upscaled ? statusBadge(status) : null

  // Reset the loading state whenever the displayed image changes.
  useEffect(() => setLoaded(false), [src])

  return (
    <figure className="tile">
      <div
        className={`tile__art${loaded ? ' is-loaded' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`View ${card.name}`}
        draggable
        onDragStart={(event) => {
          setDragging(card)
          event.dataTransfer.effectAllowed = 'copy'
        }}
        onDragEnd={() => setDragging(null)}
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
        {available && (
          <button
            className={`tile__upscale${upscaled ? ' is-on' : ''}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              if (upscaled) unmarkUpscaled(card.id)
              else void upscaleCardWithConfirm(card)
            }}
            aria-pressed={upscaled}
            title={upscaled ? 'Show original' : 'Upscale this card'}
          >
            {upscaled ? 'Original' : 'Upscale 4×'}
          </button>
        )}
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
