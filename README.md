# PhoxxPhire Proxy

> A desktop tool for printing high-quality **Magic: The Gathering** proxies — with Real-ESRGAN AI upscaling baked into the pipeline.

[![CI](https://github.com/Phoxxphire2309/PhoxxPhire-Proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/Phoxxphire2309/PhoxxPhire-Proxy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

PhoxxPhire Proxy pulls card data and art from the [Scryfall API](https://scryfall.com/docs/api),
runs every image through **Real-ESRGAN** super-resolution for crisp text and clean edges, then
lays cards out with configurable bleed and cut guides for print-ready PDF / PNG export.

**The upscaling pass is the point.** Scryfall's `png` art is 745×1040 (~300 DPI at card size).
A clean 4× pass lifts that well past what any home or print-shop printer resolves, and the tool
can also **generate true bleed** by mirror-extending the art outward — neither of which other
proxy tools do.

---

## Screenshots

> Capture instructions: [`docs/screenshots/README.md`](docs/screenshots/README.md)

| Search & grid | Before / after upscaling |
| --- | --- |
| ![Search and card grid](docs/screenshots/search.png) | ![Before/after upscale slider](docs/screenshots/upscale-compare.png) |

| Card detail — printings & prices | Deck panel & PDF export |
| --- | --- |
| ![Card detail with printings and prices](docs/screenshots/card-detail.png) | ![Deck panel and export dialog](docs/screenshots/deck-export.png) |

---

## Features

**Image quality (the moat)**
- **Real-ESRGAN 4× upscaling** of every card via the `realesrgan-ncnn-vulkan` binary (GPU, Vulkan/Metal).
- **AI bleed** — mirror-extends art into the bleed margin instead of stretching or leaving white.
- Model picker (`x4plus` / anime) and 2×/4× output (2× ≈ 600 DPI, the print sweet spot).
- Drag **before/after slider** to compare original vs upscaled.
- Smart cache: upscaled images stored as JPEG (~40× smaller than PNG) with an LRU size cap.

**Sourcing & search**
- Scryfall search with **autocomplete** and an **advanced filter** builder (colour, type, rarity, format, set).
- **Card detail** view: zoom, flip double-faced cards, switch between every **printing/set**, and see per-printing **prices**.

**Deck building**
- Import a decklist by **paste** (plain text / MTG Arena format) or by **URL** (Archidekt, Moxfield).
- **Custom card upload** — drop in your own art and it's treated like any card (upscaled, bled, printed).
- Save / load decks, quantities, running deck price, and one-click "pre-upscale all".

**Print & export**
- Page sizes A4 / Letter / Legal / A3 / custom, portrait or landscape.
- Configurable **bleed**, **cut guides** (outline / corner marks), and **duplex card backs**.
- **Calibration page** to verify your printer isn't silently scaling.
- Export print-ready **PDF** or per-card **PNG**s.

**App**
- Persists your deck, settings, and theme across sessions.
- Light / dark theme, toast notifications, `Cmd/Ctrl+K` to focus search.
- **One-click upscaler install** from inside the app; auto-update scaffolding for packaged builds.

---

## How it relates to other tools

The workflow is inspired by the concept behind
[MTGProxyPrinter](https://github.com/luziferius/MTGProxyPrinter) (GPL-3.0), but this is an
**independent, clean-room implementation** written from scratch — no code shared or derived —
on a different stack (Electron + React + TypeScript) with the Real-ESRGAN pipeline as a
first-class feature. Released under MIT.

The upscaler is the [`realesrgan-ncnn-vulkan`](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan)
binary (BSD-3-Clause) — the same engine [Upscayl](https://github.com/upscayl/upscayl) bundles —
invoked directly as a subprocess, so there's no dependency on a separate GUI app.

---

## Run it

There are no pre-built installers yet — for now you run it from source:

```bash
npm install        # install dependencies
npm run dev        # launch the app with hot reload
```

Then click **Install upscaler** in the header to download the Real-ESRGAN engine (~50 MB) — no
terminal needed. Without it the app still works; it just shows original Scryfall art instead of
upscaled.

**Requirements:** Node.js ≥ 22.12, and a GPU with **Vulkan** support for upscaling (Macs use
Metal automatically). Decks are saved/loaded as `.json` from the deck panel's **Save** / **Load**.

Platform notes for the in-app upscaler install:

- **macOS** — Apple Silicon and Intel both work (the binary is a universal Mach-O); uses built-in `unzip`.
- **Windows** — keep GPU drivers current; extraction uses built-in PowerShell.
- **Linux** — needs Vulkan drivers (e.g. `mesa-vulkan-drivers`) and `unzip` on `PATH`.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run in development with HMR |
| `npm run build` | Type-check + bundle (main / preload / renderer) |
| `npm run setup:upscaler` | Pre-provision the Real-ESRGAN binary instead of the in-app button |
| `npm run lint` / `typecheck` / `test` | Quality gates |
| `npm run format` | Prettier write |

---

## Packaging & distribution (not yet published)

The app isn't distributed as installers yet, but the tooling is ready for when it is:

```bash
npm run package    # build an unsigned installer for the current OS → dist/ (dmg / nsis / AppImage)
```

Pushing a Git tag like `v0.1.0` (matching `package.json`'s version) triggers the **release
workflow** (`.github/workflows/release.yml`), which builds installers on macOS, Windows, and
Linux runners and attaches them to a GitHub Release. **Code signing** (Apple notarisation /
Windows certificate) is wired but inactive until you add certificates as repo secrets — see
**[docs/SIGNING.md](docs/SIGNING.md)**.

---

## How it works

Electron's three processes keep a clean security boundary:

- **Main** owns all I/O: the rate-limited Scryfall client, the upscale pipeline (subprocess +
  `sharp` post-processing), the disk cache, deck/file I/O, and PDF export.
- **Preload** exposes a typed, minimal API on `window.phoxx` via `contextBridge` (context
  isolation on, no node integration, strict CSP).
- **Renderer** is the React UI; images flow through a custom `phoxx-image://` protocol that
  serves cached/upscaled files — the single seam where upscaling and bleed are applied.

Upscaling runs **one GPU job at a time** with an in-flight dedup guard (two concurrent jobs on
the same image corrupt each other's tiles), and the binary always runs at a clean 4× — `sharp`
then downscales to the chosen output size and encodes JPEG.

### Tech stack

| Concern | Choice |
| --- | --- |
| Shell | Electron (main / preload / renderer) |
| UI | React 19 + TypeScript (strict) |
| Build | electron-vite (Vite 7), electron-builder |
| Upscaling | `realesrgan-ncnn-vulkan` + `sharp` |
| PDF | pdf-lib |
| State | zustand |
| Quality | ESLint, Prettier, Vitest (+coverage), GitHub Actions |

---

## Project structure

```
src/
  main/        # Electron main: scryfall, upscale, export, deck, custom, persist, update
  preload/     # contextBridge IPC surface
  renderer/    # React app (components + zustand stores)
  shared/      # types + pure logic shared across processes (layout, query, decklist…)
resources/
  vendor/      # Real-ESRGAN binary + models (downloaded, not committed)
```

---

## Testing

102 unit tests (Vitest) cover the pure logic — Scryfall client + rate limiter, card
normalization, decklist + deck-source parsing, query composition, layout maths, PDF generation,
the upscale service, and the image processor. CI runs lint, type-check, tests + coverage,
Prettier, and `npm audit` on every push.

```bash
npm test
```

---

## Disclaimer

For personal play-testing / proxy use only. Magic: The Gathering card images and text are
© Wizards of the Coast; this project is not affiliated with or endorsed by Wizards of the Coast
or Scryfall. Respect Scryfall's [API guidelines](https://scryfall.com/docs/api) and do not sell
proxies.

## License

[MIT](LICENSE) © 2026 Ryan Alexander
