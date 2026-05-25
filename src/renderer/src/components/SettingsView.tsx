import { useDeckUiStore } from '@renderer/state/deckUiStore'
import { UpscaleControls } from '@renderer/components/UpscaleControls'

/** The Settings view: upscale engine, cache, and print/app preferences. */
export function SettingsView(): React.JSX.Element {
  const open = useDeckUiStore((state) => state.open)
  return (
    <div className="settings">
      <h1 className="grid__heading">Settings</h1>
      <p className="grid__count">Upscaler, cache, and print preferences.</p>

      <section className="settings__card">
        <h2 className="settings__title">Upscaling &amp; cache</h2>
        <p className="settings__hint">
          Choose the Real-ESRGAN model and output scale, and manage the on-disk image cache.
        </p>
        <UpscaleControls />
      </section>

      <section className="settings__card">
        <h2 className="settings__title">Page setup</h2>
        <p className="settings__hint">
          Page size, bleed, cut guides, margins, scale, and card backs for printing.
        </p>
        <button className="toggle" type="button" onClick={() => open('pageSetup')}>
          Open page setup…
        </button>
      </section>
    </div>
  )
}
