# Theme customization + Chrome Web Store readiness — design

Date: 2026-08-24. Status: approved.

## Goal

Extend the "ScrumLaunch Teams — Dark Modern" extension so the user can customize both the
dark and the light theme (own colors), reset to defaults, and ship the result on the Chrome
Web Store with tests and documentation that follow Chrome extension best practices.

## Constraints

- teams.scrumlaunch.com is a Flutter Web app rendered with CanvasKit: the UI is one `<canvas>`.
  Per-element CSS cannot recolor it; only whole-page filters can. Customization is therefore
  expressed as *how the filter transforms the page*, not per-element colors.
- No build step / bundler. Plain scripts, loadable unpacked as-is from `src/`.
- Single permission: `storage`. Content script limited to `*://teams.scrumlaunch.com/*`.
- No remote code, no analytics, no data collection.

## Color engine (approach A: SVG feColorMatrix)

For a theme `{ background, text, contrast, saturation, keepColors }`:

1. Per channel c ∈ {r,g,b} with `bg_c`, `text_c` in 0..1:
   `out_c = text_c + in_c * (bg_c - text_c)` — white → background, black → text.
   Expressed as a 5×4 `feColorMatrix` (`color-interpolation-filters="sRGB"`):
   ```
   bg_r-text_r  0  0  0  text_r
   0  bg_g-text_g  0  0  text_g
   0  0  bg_b-text_b  0  text_b
   0  0  0  1  0
   ```
2. `inverted = luminance(background) < luminance(text)`.
3. Filter chain (CSS `filter` value), in order:
   `hue-rotate(180deg)` (only if `inverted && keepColors`) → `url(#sl-matrix)` →
   `contrast(N%)` (if ≠ 100) → `saturate(N%)` (if ≠ 100).
   The hue rotation runs *before* the matrix so the site's own colors survive inversion while
   the chosen background/text tint is applied last and untouched.
4. Identity shortcut: background `#ffffff`, text `#000000`, contrast 100, saturation 100 →
   filter is `none` and nothing is injected. This is the light default = site untouched.

`buildFilter(theme)` returns `{ css, matrix: number[20], inverted }` and is a pure function.

## Settings

`chrome.storage.sync`, key `settings`:
```
{
  v: 2,
  mode: 'dark' | 'light' | 'system',
  themes: {
    dark:  { background: '#1f1f1f', text: '#cccccc', contrast: 100, saturation: 100, keepColors: true },
    light: { background: '#ffffff', text: '#000000', contrast: 100, saturation: 100, keepColors: true }
  }
}
```
- `DEFAULT_SETTINGS` lives in `lib/defaults.js`.
- `normalizeSettings(raw)` returns a valid settings object from anything: merges missing keys
  from defaults, validates hex colors (`#rrggbb`, lowercased), clamps contrast/saturation to
  50..150, coerces `keepColors` to boolean, maps unknown `mode` to `dark`.
- Migration: v1 stored `{ mode }` at the top level. `normalizeSettings` accepts
  `{ mode }` (no `v`) and produces v2. The content script/popup/options call it on every read,
  so no explicit migration step is needed; `settings-store.js` writes back the normalized
  object once on first load.
- `settings-store.js`: `load() → Promise<settings>`, `save(patch)`, `onChange(cb)`.
  All UI writes the whole `settings` object (small; no partial-key races).

## Content script

- `content.js` runs at `document_start`, `all_frames: true`.
- On load: `load()` → compute effective theme name via `resolveTheme(mode, prefersDark)` →
  `applyTheme(themes[name])`.
- `applyTheme(theme)`:
  - `buildFilter(theme)`; if `css === 'none'` → remove `data-sl-theme` attribute and the
    `--sl-filter` variable; done.
  - Ensure an `<svg id="sl-theme-svg" aria-hidden="true">` with
    `<filter id="sl-matrix" color-interpolation-filters="sRGB"><feColorMatrix type="matrix">`
    exists as a child of `document.documentElement` (not `body`, so Flutter never touches it;
    inserted as soon as `documentElement` exists, i.e. at `document_start`).
  - Set `feColorMatrix.values` = matrix, `html.style.setProperty('--sl-filter', css)`,
    `html[data-sl-theme]` = `'dark'` if inverted else `'light'`.
- Re-applies on `chrome.storage.onChanged` (key `settings`) and on
  `matchMedia('(prefers-color-scheme: dark)')` change.
- `theme.css`:
  ```
  html[data-sl-theme] body { filter: var(--sl-filter); min-height: 100vh; }
  html[data-sl-theme="dark"] { background: <handled via variable --sl-bg>; color-scheme: dark; }
  ```
  plus scrollbar rules for the dark case. `--sl-bg` is set to the theme background so the
  area outside `body` matches.
- Verification item: `url(#sl-matrix)` must resolve as a same-document reference despite the
  page's `<base href="/">`. Chrome treats fragment-only URLs as local references; the e2e
  smoke test asserts `getComputedStyle(body).filter` contains `url("#sl-matrix")` **and** that
  the rendered background pixel equals the configured background. If it fails, fallback is to
  write `url(<document URL without fragment>#sl-matrix)` and refresh on `popstate`/
  `pushState` — only implemented if needed.

## UI

### Popup
Unchanged three-way switch (Dark / Light / System) + a ⚙ button that calls
`chrome.runtime.openOptionsPage()`. Styled with the Dark Modern palette (as today).

### Options page (`options.html`, `options_ui.open_in_tab: true`)
- Header: title, short explanation of the canvas limitation (one sentence).
- Two cards side by side (stack on narrow widths): **Dark theme**, **Light theme**. Each:
  - Background: `<input type="color">` + hex text input (kept in sync, validated).
  - Text: same.
  - Contrast: range 50–150, step 5, value label.
  - Saturation: range 50–150, step 5, value label.
  - Keep original colors: checkbox (only meaningful when inverted; shown always, hint text).
  - **Reset to default** (this theme only).
- Live preview panel per card: a small mock (header bar, paragraph, primary button, link,
  orange badge, small embedded image) rendered with the same `buildFilter` output via an
  inline SVG filter in the options page. Updates on every input event.
- Footer: **Reset all to defaults** (both themes + mode), "Saved ✓" status text.
- Auto-save: every change is normalized and written to storage (debounced 150 ms for
  sliders); the status text shows "Saved". No explicit Save button.
- Accessibility: labels bound to inputs, keyboard operable, focus rings, `aria-live` on status.

## Project layout

```
src/
  manifest.json
  _locales/en/messages.json         (name, description; default_locale "en")
  icons/icon{16,32,48,128}.png
  lib/theme-logic.js                (resolveTheme, MODES, DEFAULT_MODE)
  lib/color.js                      (hex parse/format, luminance)
  lib/filter.js                     (buildFilter)
  lib/defaults.js                   (DEFAULT_SETTINGS, DEFAULT_THEMES)
  lib/settings.js                   (normalizeSettings)
  lib/settings-store.js             (load/save/onChange over chrome.storage)
  content/content.js, content/theme.css
  popup/popup.html|css|js
  options/options.html|css|js
tests/unit/*.test.js                node:test, run with `npm run test:unit`
tests/e2e/*.spec.js                 @playwright/test, persistent context with the extension
tests/e2e/fixtures/extension.js     shared fixture: launches Chromium with src/ loaded
scripts/package.sh                  zips src/ → dist/<name>-<version>.zip
scripts/screenshots.spec.js         produces 1280×800 store screenshots into store/
docs/PRIVACY.md, docs/STORE_LISTING.md, docs/DEVELOPMENT.md, CHANGELOG.md
.github/workflows/ci.yml            npm ci, lint, unit, e2e (Playwright chromium)
package.json, eslint.config.js, .prettierrc, LICENSE (MIT), README.md
```

Library files use the existing pattern: classic scripts that attach to `self.SL` (namespace
object) in the browser and `module.exports` under Node — no bundler, testable in `node:test`.
Load order in manifest/HTML: color → defaults → settings → theme-logic → filter → settings-store.

## Manifest (MV3)

```
manifest_version 3, name/description via __MSG_*__, default_locale "en", version "2.0.0",
minimum_chrome_version "110", permissions ["storage"], icons 16/32/48/128,
action { default_popup, default_icon, default_title },
options_ui { page: "options/options.html", open_in_tab: true },
content_scripts [{ matches: ["*://teams.scrumlaunch.com/*"], css, js, run_at: document_start, all_frames: true }]
```
No `host_permissions`, no background worker, no `web_accessible_resources`.

## Testing

- Unit (node:test): color parsing; `buildFilter` — white→background and black→text exactly,
  identity shortcut, inverted detection, hue-rotate present only when inverted+keepColors,
  contrast/saturate omitted at 100; `normalizeSettings` — defaults, v1 migration, invalid
  colors/ranges, unknown mode; `resolveTheme` (existing).
- E2E (Playwright, Chromium with extension loaded):
  - popup: default selection is Dark; clicking modes persists to storage; gear opens options.
  - options: renders defaults; changing dark background persists and updates preview;
    per-theme reset restores defaults; reset-all restores mode + both themes; hex input
    validation.
  - real-site smoke (skipped when `E2E_SITE=0` or offline): on
    https://teams.scrumlaunch.com/time-tracker the `<html>` gets `data-sl-theme="dark"`, body
    filter contains `url("#sl-matrix")`, and a sampled background pixel equals the configured
    background (±2/255); switching to Light removes the filter.
- CI runs lint + unit + e2e (site smoke enabled; failure of the smoke because the site is
  unreachable is reported as skipped, not failed).

## Documentation

- README: what it does, install from store / unpacked, usage, customization, how it works,
  limitations, development, license.
- docs/DEVELOPMENT.md: layout, scripts, testing, release/packaging, versioning.
- docs/PRIVACY.md: no data collected; settings stored in Chrome sync storage only.
- docs/STORE_LISTING.md: store title, summary (≤132 chars), description, category, screenshots
  list, single-purpose statement, permission justification (`storage`).
- CHANGELOG.md (Keep a Changelog), starting with 1.0.0 and 2.0.0.

## Out of scope

Per-element colors, other sites, presets gallery, syncing across browsers other than Chrome
sync, Firefox/Safari builds.
