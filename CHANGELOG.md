# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-06-30

### Added

- **MPCFill as an alternative card-image source.** Each card's art picker now has
  a Scryfall ↔ MPCFill toggle; choosing an MPCFill image uses that community proxy
  (served from Google Drive) instead of the Scryfall scan. The choice is per-card,
  so a deck can mix sources, and it flows through the deck grid, print preview, and
  PDF/print/image exports. MPCFill images ship with bleed, so the export pipeline
  skips its mirrored-bleed step for them to keep cut lines aligned.
  - New `MpcfillClient` (`/2/editorSearch/` + `/2/cards/`, rate-limited, retrying)
    and `MpcfillService` (Google Drive download + cache, reusing the image cache
    under a namespaced id) behind a new `phoxx-image://mpcfill/<driveId>/<quality>`
    protocol host.
  - Picks persist in app state (`mpcfillSelections`); Settings → Card images offers
    a one-click reset to Scryfall.

### Internal

- Release builds now fail if the in-app "What's new" changelog wasn't updated to
  match the version (`scripts/check-changelog-version.mjs`, wired into `build`).
- Extracted the shared `downloadImage` helper used by both the Scryfall and MPCFill
  image paths.

### Known limitations

- The MakePlayingCards (MPC) order export and a few secondary browse thumbnails
  (sample hand, deck health, page-setup) still render Scryfall art.
- A DFC's reverse face and any Drive download that hits Google's per-file quota
  fall back to / show the Scryfall scan.

## [1.1.1] - 2026-06-29

### Fixed

- Card images failed to load (cards rendered blank with a broken-image icon)
  while card data and the deck stats still loaded correctly. Scryfall's image
  CDN (`cards.scryfall.io`) now rejects requests with a generic User-Agent —
  the main-process image downloader was sending Node's default `node` agent and
  getting an HTTP 400 on every image. Image downloads now send the same accurate
  `User-Agent` (and `Accept`) headers the metadata client already used.

## [1.1.0] - 2026-06-09

- Deck library, printing filters, additional deck imports, language support, and
  printing fixes.

[2.0.0]: https://github.com/phoxxphire/proxy/releases/tag/v2.0.0
[1.1.1]: https://github.com/phoxxphire/proxy/releases/tag/v1.1.1
[1.1.0]: https://github.com/phoxxphire/proxy/releases/tag/v1.1.0
