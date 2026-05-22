# PhoxxPhire Proxy

A desktop tool for printing high-quality **Magic: The Gathering** proxies. It pulls
card data and art from the [Scryfall API](https://scryfall.com/docs/api), runs every
image through **Real-ESRGAN** super-resolution for crisp text and clean edges, then
lays cards out with configurable bleed and cut guides for print-ready PDF / PNG export.

The Real-ESRGAN upscaling pass is the distinguishing feature: Scryfall's `png` art is
745×1040 (~300 DPI at card size), and a 4× pass lifts that to ~2980×4160, giving real
headroom for bleed and sharp rendering on a home or print-shop printer.

## How it relates to other tools

The workflow is inspired by the concept behind
[MTGProxyPrinter](https://github.com/luziferius/MTGProxyPrinter) (GPL-3.0), but this is
an **independent, clean-room implementation** written from scratch — no code is shared
or derived — built on a different stack (Electron + React + TypeScript) with the
Real-ESRGAN upscaling pipeline as a first-class feature. It is released under MIT.

The upscaler is the [`realesrgan-ncnn-vulkan`](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan)
binary (BSD-3-Clause) — the same engine [Upscayl](https://github.com/upscayl/upscayl)
bundles — invoked directly as a subprocess so we get GPU acceleration (Vulkan/Metal)
without depending on a separate GUI app.

## Status

Built in phases:

- [x] **Phase 0** — project scaffold (Electron + Vite + TS, lint/type/test/CI)
- [x] **Phase 1** — Scryfall search & card fetch (rate-limited, cached)
- [x] **Phase 2** — Real-ESRGAN upscale pipeline & disk cache
- [x] **Phase 3** — deck import, deck panel & set/version switching
- [x] **Phase 4** — layout, bleed, cut guides & PDF export

## Tech stack

| Concern       | Choice                                      |
| ------------- | ------------------------------------------- |
| Shell         | Electron (main / preload / renderer)        |
| UI            | React 19 + TypeScript (strict)              |
| Build         | electron-vite (Vite 8), electron-builder    |
| Upscaling     | `realesrgan-ncnn-vulkan` subprocess         |
| PDF export    | pdf-lib                                      |
| Quality gates | ESLint, Prettier, Vitest (+coverage), GH CI |

## Prerequisites

- Node.js **>= 22.12**
- A GPU with Vulkan support (Metal on macOS). CPU fallback works but is slow.
- The `realesrgan-ncnn-vulkan` binary + models. The app can fetch these for you —
  click **Install upscaler** in the header when it reports the upscaler is missing.
  (For dev you can also pre-provision with `npm run setup:upscaler`.) Without it the
  app still runs, just showing original Scryfall art. See
  [`resources/vendor/README.md`](resources/vendor/README.md).

## Scripts

```bash
npm install        # install dependencies
npm run dev        # launch the app in development (HMR)
npm run build      # type-check + bundle
npm run package    # build a distributable (electron-builder)

npm run lint       # ESLint
npm run typecheck  # tsc --noEmit (main + renderer)
npm test           # Vitest
npm run format     # Prettier write
```

## Disclaimer

For personal play-testing / proxy use only. Magic: The Gathering card images and text
are © Wizards of the Coast; this project is not affiliated with or endorsed by Wizards
of the Coast or Scryfall. Respect Scryfall's
[API guidelines](https://scryfall.com/docs/api) and do not sell proxies.

## License

[MIT](LICENSE) © 2026 Ryan Alexander
