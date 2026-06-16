import { useEffect, useState } from 'react'

interface Step {
  title: string
  points: string[]
}

const STEPS: Step[] = [
  {
    title: 'Welcome to PhoxxPhire Proxy Maker',
    points: [
      'The MTG proxy printer that AI-upscales every card before printing — for sharp, true-to-size proxies.',
      'Use the arrows to take the tour, or close it and dive in. You can reopen this any time from the “?” in the header.'
    ]
  },
  {
    title: '1 · Search & build',
    points: [
      'Search Scryfall by name or syntax (e.g. t:goblin, set:mh3). Autocomplete suggests names; the “?” opens the full syntax reference.',
      'An empty search box shows your recent searches.',
      'Use Filters for colour, type, rarity and more. Click any result to open it; click again to add it to the deck.'
    ]
  },
  {
    title: '2 · Card detail & printings',
    points: [
      'Click a card to zoom in, see its price, and flip double-faced cards.',
      'Switch between every printing in the thumbnail strip, or hit “Use best-quality printing” to grab the highest-resolution scan (HD badge).'
    ]
  },
  {
    title: '3 · Upscale the art',
    points: [
      'Run cards through Real-ESRGAN for much sharper prints — per card, or “Pre-upscale all”.',
      'In the card view, drag the divider across the image to compare original vs upscaled.',
      'First use downloads the upscaler once; it then runs fully offline.'
    ]
  },
  {
    title: '4 · Manage your deck',
    points: [
      'Multiple deck tabs (＋ to add, double-click to rename). Group cards into Main / Commander / Sideboard / Maybeboard — the maybeboard never prints.',
      'Undo/redo (Cmd/Ctrl+Z). Bulk-switch every card to its best scan or cheapest printing.',
      'Quick-add basic lands and auto-detect the tokens/emblems your deck makes. The Stats panel shows mana curve, colours and types.'
    ]
  },
  {
    title: '5 · Your collection',
    points: [
      'Paste the cards you already own into Collection.',
      'Turn on “skip owned cards” and exports leave them out — but each owned card has a per-card toggle to print it anyway when you want extras.'
    ]
  },
  {
    title: '6 · Dial in your printer',
    points: [
      'Page setup: per-edge margins (0 prints to the edge), bleed style, cut guides, and duplex card backs (plain or your own image).',
      'Choose an inkjet/laser colour profile so prints don’t come out washed-out.',
      'Print the calibration page, measure the 100 mm square, and enter it — the scale % then makes cards trim to exactly 63×88 mm.'
    ]
  },
  {
    title: '7 · Export anywhere',
    points: [
      'Export a print-ready PDF, a ZIP of images, single images, or a MakePlayingCards (MPC Autofill) order.',
      '“Test card” prints just one card so you can check scale and colour first. Add a “PROXY” watermark if your playgroup requires it.',
      'Save a project file to reproduce a whole print job (deck + layout) later. Rotate individual cards 180° from the deck list.',
      'That’s the tour — happy proxying!'
    ]
  }
]

/** Paged first-run tutorial with prev/next navigation. */
export function Onboarding({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [step, setStep] = useState(0)
  const last = STEPS.length - 1
  const current = STEPS[step]!

  const clamp = (value: number): number => Math.min(STEPS.length - 1, Math.max(0, value))
  const go = (delta: number): void => setStep((s) => clamp(s + delta))

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') setStep((s) => clamp(s + 1))
      else if (event.key === 'ArrowLeft') setStep((s) => clamp(s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Quick tour">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel import">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">{current.title}</h2>
        <ul className="onboard__list">
          {current.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        <div className="onboard__nav">
          <button
            className="toggle"
            type="button"
            onClick={() => go(-1)}
            disabled={step === 0}
            aria-label="Previous"
          >
            ‹ Back
          </button>

          <div className="onboard__dots" aria-hidden="true">
            {STEPS.map((s, index) => (
              <span key={s.title} className={`onboard__dot${index === step ? ' is-on' : ''}`} />
            ))}
          </div>

          {step < last ? (
            <button className="toggle" type="button" onClick={() => go(1)} aria-label="Next">
              Next ›
            </button>
          ) : (
            <button className="search__button" type="button" onClick={onClose}>
              Get started
            </button>
          )}
        </div>
        <p className="onboard__counter">
          {step + 1} / {STEPS.length}
        </p>
      </div>
    </div>
  )
}
