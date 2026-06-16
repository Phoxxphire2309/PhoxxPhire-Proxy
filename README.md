# PhoxxPhire Proxy Maker

> A desktop app for printing high-quality **Magic: The Gathering** proxies — with Real-ESRGAN AI upscaling baked into the pipeline.

[![CI](https://github.com/Phoxxphire2309/PhoxxPhire-Proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/Phoxxphire2309/PhoxxPhire-Proxy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

PhoxxPhire Proxy Maker pulls card data and art from the [Scryfall API](https://scryfall.com/docs/api),
runs images through **Real-ESRGAN** super-resolution for crisp art and clean edges, then lays
cards out with configurable bleed and cut guides for print-ready PDF / PNG / direct printing.

**The upscaling pass is the point.** Scryfall's `png` art is 745×1040 (~300 DPI at card size).
A clean 4× pass lifts that well past what any home or print-shop printer resolves, and the app
can also **generate true bleed** by mirror-extending the art outward — neither of which other
proxy tools do.

---

## Download

Grab the latest installer from the [**Releases**](https://github.com/Phoxxphire2309/PhoxxPhire-Proxy/releases/latest) page:

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `PhoxxPhire-Proxy-Maker-<version>-arm64.dmg` |
| Windows | `PhoxxPhire-Proxy-Maker-Setup-<version>.exe` |
| Linux | `PhoxxPhire-Proxy-Maker-<version>.AppImage` |

> **Unsigned builds.** The installers aren't code-signed yet, so the OS shows a first-launch
> warning. See [Installing an unsigned build](#installing-an-unsigned-build) below — it's a
> one-time step. The app notifies you in-app when a newer release is available.

---

## Features

**Image quality (the moat)**
- **Real-ESRGAN upscaling** of every card via the `realesrgan-ncnn-vulkan` binary (GPU, Vulkan/Metal).
- **AI bleed** — mirror-extends art into the bleed margin instead of stretching or leaving white.
- Model picker (`x4plus` / anime) and 2×/4× output (2× ≈ 600 DPI, the print sweet spot).
- Drag **before/after slider** to compare original vs upscaled.
- **Deck print-quality report** — grades every card (HD scan / upscaled / low-res / text proxy) with one-click "raise all to best quality".
- Smart cache: thumbnails for browsing, full-resolution only for printing, with an LRU size cap.

**Sourcing & search**
- Scryfall search with **autocomplete**, live **filters** (colour, type, rarity, format, set, artist, mana value, language) and sorting.
- **Card detail** view: flip double-faced cards, switch between every **printing** (filter by set, newest first), and see per-printing **prices**.
- **Custom card upload** — drop in your own art and it's treated like any card (upscaled, bled, printed).

**Deck building**
- **Multiple deck tabs**, **undo/redo**, drag-and-drop, deck **sections** (commander / main / sideboard / maybeboard).
- Import by **paste** (text / MTG Arena) or **URL** (Archidekt, Moxfield, Cube Cobra, MTGGoldfish, TappedOut), with an option to **exclude foils**.
- Export the list as **text**, **MTG Arena**, or **CSV**; save / load decks and full projects.
- **Group** (type / colour / rarity / mana value / section) and **sort** within groups, with collapsible groups.
- Deck **stats**, **format legality**, price-by-section, **combo detection** (Commander Spellbook), **token** + **basic-land** helpers, and a **sample-hand** draw.
- **Deck health** panel + **switch every printing** in one click (best scan / cheapest / newest / most expensive).

**Print & export**
- Page sizes A4 / Letter / Legal / A3 / custom, portrait or landscape, per-edge margins, and **scale calibration**.
- **Split large PDFs** into multiple files by page count for print services that cap uploads (keeps duplex front/back pairs together).
- Configurable **bleed** (extend / solid / zoom), **cut guides** (outline / corner marks), a **card-back library** for duplex, and **duplex registration** offsets to align fronts and backs.
- **Print presets** — save whole page-setup profiles ("Home inkjet", "Print-shop A3") and switch in one click.
- **WYSIWYG print preview** with drag-to-reorder, spacers, and per-card 180° rotation.
- **Print directly**, or export a print-ready **PDF**, per-card **PNG**s, a **ZIP**, a **cut-file SVG**, or a **MakePlayingCards (MPC Autofill)** order.

**App**
- Persists decks, presets, settings, and theme across sessions.
- Light / dark theme, **command palette** (`Cmd/Ctrl+K`), toast notifications, a guided first-run tour.
- **In-app update banner** that links to a new release, plus auto-update scaffolding for signed builds.

---

## Installing an unsigned build

Because the installers aren't code-signed, the OS guards them on first launch. One-time fix:

**macOS** — after dragging the app to Applications:

```bash
/usr/bin/xattr -rd com.apple.quarantine "/Applications/PhoxxPhire Proxy Maker.app"
codesign --force --deep --sign - "/Applications/PhoxxPhire Proxy Maker.app"
```

Then open it normally. (The first command clears the download quarantine; the second gives the
app an ad-hoc signature so Apple Silicon will run it.)

**Windows** — SmartScreen shows "Windows protected your PC": click **More info → Run anyway**.

The permanent fix on both platforms is code signing — see [docs/SIGNING.md](docs/SIGNING.md). The
release workflow already reads signing secrets when they're present.

---

## Run from source

```bash
npm install
npm run dev
```

`npm install` pulls dependencies; `npm run dev` launches the app with hot reload. Then open
**Settings → Install upscaler** to download the Real-ESRGAN engine (~50 MB) — no terminal
needed. Without it the app still works; it just shows original Scryfall art instead of upscaled.

**Requirements:** Node.js ≥ 22.12, and a GPU with **Vulkan** support for upscaling (Macs use
Metal automatically).

Platform notes for the upscaler:

- **macOS** — Apple Silicon and Intel both work (universal Mach-O binary); uses built-in `unzip`.
- **Windows** — keep GPU drivers current; ships `vulkan-1.dll` alongside the binary.
- **Linux** — needs Vulkan drivers (e.g. `mesa-vulkan-drivers`) and `unzip` on `PATH`.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run in development with HMR |
| `npm run build` | Type-check + bundle (main / preload / renderer) |
| `npm run package` | Build an unsigned installer for the current OS into `dist/` |
| `npm run setup:upscaler` | Pre-provision the Real-ESRGAN binary instead of the in-app button |
| `npm run lint` / `typecheck` / `test` | Quality gates |
| `npm run format` | Prettier write |

---

## Releasing

Bump `version` in `package.json`, then push a matching tag:

```bash
git tag v1.0.1 && git push origin v1.0.1
```

The **release workflow** (`.github/workflows/release.yml`) builds installers on macOS, Windows,
and Linux runners and attaches them — plus the `latest*.yml` auto-update manifests — to a GitHub
Release (created as a draft; click **Publish** when ready). Running the workflow manually
(**Actions → Release → Run workflow**) instead produces the installers as downloadable artifacts
without publishing. **Code signing** (Apple notarisation / Windows certificate) activates
automatically when the relevant repo secrets are set — see **[docs/SIGNING.md](docs/SIGNING.md)**.

---

## How it works

Electron's three processes keep a clean security boundary:

- **Main** owns all I/O: the rate-limited Scryfall client, the upscale pipeline (subprocess +
  `sharp` post-processing), the disk cache, deck/file I/O, and PDF export.
- **Preload** exposes a typed, minimal API on `window.phoxx` via `contextBridge` (context
  isolation on, no node integration, strict CSP).
- **Renderer** is the React UI; images flow through a custom `phoxx-image://` protocol that
  serves cached/upscaled files — the single seam where upscaling and bleed are applied.

Upscaling runs **one GPU job at a time** with an in-flight dedup guard, and the binary runs at a
clean 4×; `sharp` then downscales to the chosen output size and encodes JPEG.

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
  main/        # Electron main: scryfall, upscale, export, deck, custom, cardback, combo, persist, update
  preload/     # contextBridge IPC surface
  renderer/    # React app (components + zustand stores)
  shared/      # types + pure logic shared across processes (layout, query, decklist, deckSort…)
resources/
  vendor/      # Real-ESRGAN binary + models (downloaded, not committed)
```

---

## How it relates to other tools

The workflow is inspired by the concept behind
[MTGProxyPrinter](https://github.com/luziferius/MTGProxyPrinter) (GPL-3.0), but this is an
**independent, clean-room implementation** written from scratch — no code shared or derived — on
a different stack (Electron + React + TypeScript) with the Real-ESRGAN pipeline as a first-class
feature. Released under MIT. The upscaler is the
[`realesrgan-ncnn-vulkan`](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan) binary
(BSD-3-Clause), invoked directly as a subprocess.

---

## Testing

240+ unit tests (Vitest) cover the pure logic — Scryfall client + rate limiter, card
normalization, decklist parsing/export, deck-source parsing, query composition, layout maths,
PDF generation, sample-hand shuffling, the upscale service, the image processor, deck grouping
and sorting, page-setup presets, and the update version check. CI runs lint, type-check,
Prettier, tests + coverage, a full build, and `npm audit` on every push.

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
