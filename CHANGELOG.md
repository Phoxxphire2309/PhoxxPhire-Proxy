# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.1]: https://github.com/phoxxphire/proxy/releases/tag/v1.1.1
[1.1.0]: https://github.com/phoxxphire/proxy/releases/tag/v1.1.0
