# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project's versioning follows the extension's `src/manifest.json`
`version` field.

## [2.0.0] - 2026-08-25

### Added

- Customizable dark and light themes via a new options page: independent
  background, text, contrast (50–150) and saturation (50–150) controls and a
  "keep original colors" toggle for each theme, with live preview and a
  readability hint (WCAG contrast ratio warning).
- A composed `feColorMatrix` color engine (`lib/filter.js`): a single SVG
  filter combines hue rotation, a background/text tint, contrast and
  saturation into one matrix, plus its exact mathematical inverse applied to
  real DOM images/video so they keep their original colors.
- Settings schema v2 (`{ v: 2, mode, themes: { dark, light } }`) with
  automatic migration from the v1 `{ mode }` shape. Saves within one page are
  serialized, and the write itself is a field-level merge, so an edit on one
  surface (popup vs. options) or device cannot clobber a _different_ field
  edited on another; the same field is last-write-wins.
- A gear button in the popup that opens the new options page.
- Photos the Flutter app paints inside its canvas (profile avatars, uploaded
  logos, picked-photo previews) now keep their original colors in dark mode:
  a MAIN-world content script (`content/page.js`) wraps the page's
  `ImageDecoder` and `HTMLImageElement.decode` — the two codecs the Flutter
  engine turns images into textures with — and pre-corrects every decoded
  image with the inverse matrix so the page filter maps it back to the
  original. Highlights brighter than
  the theme's text color are capped at that brightness. A theme change on a
  page holding such images reloads it (deferred while a text field is
  focused), since Flutter's decoded-image cache cannot be flushed from outside.
- Store-readiness: `_locales/en` manifest metadata, extension icons,
  `scripts/package.sh` and `scripts/screenshots.spec.js`, GitHub Actions CI
  (`ci.yml`, `site-smoke.yml`), and the documentation set in `docs/` and
  `site/`.

## [1.0.0] - 2026-08-24

### Added

- Initial dark theme for teams.scrumlaunch.com using a CSS `invert()` +
  `hue-rotate()` filter approach.
- Dark / Light / System switch in the toolbar popup, backed by
  `chrome.storage.sync`.
