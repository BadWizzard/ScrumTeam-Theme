# Theme customization + Chrome Web Store readiness — design

Date: 2026-08-24 (revised 2026-08-25 after review rounds 1–2). Status: approved.

## Goal

Extend the extension so the user can customize both the dark and the light theme (own
colors), reset to defaults, and ship the result on the Chrome Web Store with tests and
documentation that follow Chrome extension best practices.

## Constraints

- teams.scrumlaunch.com is a Flutter Web app rendered with CanvasKit: the UI is one `<canvas>`.
  Per-element CSS cannot recolor it; only whole-page filters can. Customization is therefore
  expressed as *how the filter transforms the page*, not per-element colors.
- No build step / bundler. Plain scripts, loadable unpacked as-is from `src/`.
- Single permission: `storage`. Content script limited to `*://teams.scrumlaunch.com/*`.
- No remote code, no analytics, no data collection.
- Product name: **Dark Modern for ScrumLaunch Teams** (reads as a third-party add-on; see
  "Store listing" for the affiliation position).

## Color engine (single composed `feColorMatrix`)

For a theme `{ background, text, contrast, saturation, keepColors }` the page is rendered
through exactly **one** SVG color matrix, `filter: url("#sl-matrix")`. The matrix is the
composition of four affine per-pixel transforms (each a 3×3 matrix `A` plus offset `b`,
`out = A·in + b`, stored as the 5×4 `feColorMatrix` layout):

1. **Hue rotation `H`** — the CSS `hue-rotate(180deg)` matrix from the Filter Effects spec
   (cos = −1, sin = 0), included only when `inverted && keepColors`. It runs first so the
   site's own colors survive the inversion that the tint performs next.
2. **Tint `T`** — per channel c: `out_c = text_c + in_c · (bg_c − text_c)`, i.e. white →
   background, black → text. `inverted = luminance(background) < luminance(text)`; when
   inverted, `T` is what darkens the page.
3. **Contrast `C`** — `out = a·in + (1−a)/2` with `a = contrast/100` (CSS `contrast()` semantics).
4. **Saturation `S`** — the CSS `saturate(s)` matrix, `s = saturation/100`.

`M = S · C · T · H` (applied right-to-left to the pixel). `color-interpolation-filters="sRGB"`
on the `<filter>` keeps the math in the same space CSS shorthand filters use, so `M` matches
the equivalent shorthand chain.

**Inverse for real DOM images.** Images, videos and `<picture>` elements outside the canvas
must keep their original colors. `buildFilter` also emits `inverseMatrix = M⁻¹` (general
3×3 affine inverse: `A⁻¹`, `−A⁻¹·b`). Because it is the exact inverse of the composed
matrix, contrast and saturation are undone as well. If `M` is singular (only possible when
`bg_c == text_c` for some channel — a degenerate theme), `inverseMatrix` is the identity
and `inverseCss` is `'none'`; the options page shows a readability hint for such themes.

**Identity shortcut.** Background `#ffffff`, text `#000000`, contrast 100, saturation 100 →
`css` and `inverseCss` are `'none'` and nothing is injected. This is the light default =
site untouched.

`buildFilter(theme, filterId = 'sl-matrix')` returns
`{ css, inverseCss, matrix: number[20], inverseMatrix: number[20], inverted, background }` and
is a pure function: `css` is `url("#<filterId>")` or `'none'`; `inverseCss` is
`url("#<filterId>-inverse")` or `'none'`; `background` is the **rendered** background —
`M([1,1,1])` clamped to the gamut and formatted as `#rrggbb` — which equals
`theme.background` only when contrast and saturation are both 100. `filterId` lets the options-page preview use its
own ids (`sl-matrix-dark`, `sl-matrix-light`) without rewriting strings.

Helpers (in `lib/filter.js`, unit-tested): `compose(a, b)` (affine product), `invert(a)`
(affine inverse, returns `null` when `|det| < 1e-9`), `hueRotate180()`, `saturate(s)`,
`contrast(a)`, `tint(bg, text)`, and `toFeValues(m)` (→ 20 numbers).

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
- `DEFAULT_SETTINGS`, `DEFAULT_THEMES`, `MODES`, `DEFAULT_MODE`, `SETTINGS_VERSION`, `RANGE`
  live in `lib/defaults.js`.
- `normalizeSettings(raw)` returns a valid settings object from anything: merges missing keys
  from defaults, validates hex colors (strict `#rrggbb` only — no `#rgb` shorthand — lowercased),
  clamps numeric contrast/saturation to 50..150 (non-numeric → default 100),
  `keepColors = raw == null ? default : Boolean(raw)` (so a missing or `null` value keeps the
  default `true`, `0`/`false`/`''` → `false`, any other value → `true`), maps unknown `mode`
  to `dark`, drops unknown keys.
- Migration: v1 stored `{ mode }` at the top level. `normalizeSettings` accepts
  `{ mode }` (no `v`) and produces v2. Every reader normalizes, so the app works without an
  explicit migration. Additionally, `load()` writes the normalized v2 object back **only when
  there is stored data that is not already v2, and the caller is the top frame**
  (`window === window.top`) — the content script runs in every frame of every tab, and
  `chrome.storage.sync` has write quotas (120 ops/min, 1800/hour), so sub-frames must not
  each issue the same write. A profile with nothing stored at all has nothing to migrate and
  performs **zero** writes on load: every reader normalizes anyway, so writing the defaults
  back would be pure quota cost (and would race any concurrent writer). The write-back
  removes the legacy top-level `mode` key.
- `settings-store.js`: `load() → Promise<settings>`, `save(patch) → Promise<settings>`,
  `onChange(cb)`, and the pure `merge(base, patch)` (unit-tested).
  `save(patch)` **re-reads storage, deep-merges the patch** (`mode`, and `themes.dark` /
  `themes.light` merged per field), normalizes, writes, and resolves with the result. The
  popup therefore writes only `{ mode }`, and the options page writes only the theme it
  changed (`{ themes: { dark: {...} } }`). Within one page, saves are **serialized** through
  a promise chain, so a second save always re-reads after the first has been written — read-
  modify-write can't drop a patch. Across pages and devices there is no shared chain: the
  merge is field-level, so a stale snapshot cannot clobber a *different* field, but the same
  field is last-write-wins. True cross-context atomicity would need a background worker and
  is out of scope.
  `save` rejects when `chrome.runtime.lastError` is set; **every caller surfaces that**
  (popup and options both show a "Not saved" status).

## Content script

- `content.js` runs at `document_start`, `all_frames: true`.
- On load: `load()` → effective theme name via `resolveTheme(mode, prefersDark)` →
  `applyTheme(themes[name])`.
- `applyTheme(theme)`:
  - `buildFilter(theme)`; if `css === 'none'` → remove `data-sl-theme` and the
    `--sl-filter`, `--sl-filter-inverse`, `--sl-bg` variables; done.
  - `ensureSvg()` guarantees an `<svg id="sl-theme-svg" aria-hidden="true">` child of
    `document.documentElement` (not `body`, so Flutter never touches it; inserted at
    `document_start`) containing two filters, `<filter id="sl-matrix">` and
    `<filter id="sl-matrix-inverse">`, each `color-interpolation-filters="sRGB"` with one
    `<feColorMatrix type="matrix">`. It returns `{ fwd, inv }` (the two `feColorMatrix`
    nodes) on both the create path and the already-present path.
  - Set `fwd.values` = matrix, `inv.values` = inverseMatrix, `--sl-filter` = css,
    `--sl-filter-inverse` = inverseCss, `--sl-bg` = `buildFilter`'s `background` (the
    **rendered** background, i.e. `M(white)` — the `<html>` background and the scrollbars
    sit outside the filtered subtree, so using the raw `theme.background` would leave a
    visible seam whenever contrast or saturation is not 100),
    `html[data-sl-theme]` = `'dark'` if inverted else `'light'`.
- Re-applies on `chrome.storage.onChanged` (key `settings`) and on
  `matchMedia('(prefers-color-scheme: dark)')` change.
- `theme.css`:
  ```
  html[data-sl-theme] { background: var(--sl-bg) !important; }
  html[data-sl-theme="dark"] { color-scheme: dark; }
  html[data-sl-theme] body { filter: var(--sl-filter); min-height: 100vh; }
  html[data-sl-theme] body :is(img, video, picture, [style*="background-image"]) { filter: var(--sl-filter-inverse); }
  html[data-sl-theme] #splash img { filter: none; }   /* splash ships its own dark variant */
  /* scrollbars live on <html>, outside the filtered subtree: derive from the theme */
  html[data-sl-theme="dark"] ::-webkit-scrollbar { width: 12px; height: 12px; }
  html[data-sl-theme="dark"] ::-webkit-scrollbar-track { background: var(--sl-bg); }
  html[data-sl-theme="dark"] ::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--sl-bg), #ffffff 18%);
    border: 3px solid var(--sl-bg); border-radius: 6px;
  }
  html[data-sl-theme="dark"] ::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--sl-bg), #ffffff 26%); }
  ```
  The image rule preserves v1 behaviour (real DOM images keep their original colors) under
  any user-chosen matrix. `color-mix()` requires Chrome 111 → `minimum_chrome_version` is
  `"111"`.
- Verified during review round 1 (headless Chrome, four combinations): `url(#sl-matrix)`
  resolves as a same-document reference despite the page's `<base href="/">`. The site smoke
  test still asserts it.

## UI

### Popup
Three-way switch (Dark / Light / System) + a ⚙ button that calls
`chrome.runtime.openOptionsPage()`. On click: `store.save({ mode })` → re-render from the
resolved settings; on rejection, a status line under the switch shows
"Not saved — <message>" and the previous selection is re-rendered.

### Options page (`options.html`, `options_ui.open_in_tab: true`)
- Header: title, one-sentence explanation of the canvas limitation.
- Two cards side by side (stack on narrow widths): **Dark theme**, **Light theme**. Each:
  - Background: `<input type="color">` + hex text input (kept in sync, validated `#rrggbb`).
  - Text: same.
  - Contrast: range 50–150, step 5, value label. Saturation: same.
  - Keep original colors: checkbox (hint: "only affects dark themes").
  - Readability hint: when the WCAG contrast ratio between background and text is below
    4.5:1, a non-blocking line "Low contrast (x.x:1) — text may be hard to read" appears
    (`aria-live="polite"`); when `background === text` it reads "Background and text are the
    same color — the page will be unreadable".
  - Live preview: a small mock (app bar, heading, paragraph, primary button, link, orange
    badge, 24 px data-URI image) rendered through `buildFilter(theme, 'sl-matrix-' + name)`
    via an inline SVG in the options page; the sample image uses `inverseCss`. Updates on
    every input event.
  - **Reset to default** (this theme only) → `save({ themes: { [name]: DEFAULT_THEMES[name] } })`.
- Footer: **Reset all to defaults** → `save(DEFAULT_SETTINGS)`; `#status` (`aria-live`).
- Auto-save: any change in a card is normalized and written with `save({ themes: { [name]: theme } })`,
  **debounced 400 ms per card** (trailing) to stay well inside the `storage.sync` write quota.
  Status shows "Saved", or "Not saved — <message>" with `data-state="error"` on rejection.
- Accessibility: labels bound to inputs, keyboard operable, focus rings, `aria-live` status.
- Strings are hardcoded English; `_locales/en` exists for manifest metadata only (documented
  in DEVELOPMENT.md so nobody assumes `chrome.i18n` is the house style).

## Project layout

```
src/
  manifest.json
  _locales/en/messages.json         (extName, extDescription, actionTitle; default_locale "en")
  icons/icon{16,32,48,128}.png
  lib/color.js                      (parseHex, toHex, isHex, luminance, contrastRatio)
  lib/defaults.js                   (MODES, DEFAULT_MODE, DEFAULT_THEMES, DEFAULT_SETTINGS, SETTINGS_VERSION, RANGE)
  lib/settings.js                   (normalizeSettings, normalizeTheme)
  lib/theme-logic.js                (resolveTheme; re-exports MODES/DEFAULT_MODE)
  lib/filter.js                     (buildFilter + matrix helpers)
  lib/settings-store.js             (merge — pure; load/save/onChange over chrome.storage)
  content/content.js, content/theme.css
  popup/popup.html|css|js
  options/options.html|css|js
tests/unit/*.test.js                node:test — `npm run test:unit`
tests/e2e/fixtures/extension.js     Playwright fixture: Chromium + unpacked src/, extensionId
tests/e2e/*.spec.js                 popup, options, migration (offline); site (network)
scripts/package.sh                  zips src/ → dist/<name>-<version>.zip
scripts/screenshots.spec.js         1280×800 store screenshots into store/
site/                               GitHub Pages root: index.md + privacy.md (public)
docs/DEVELOPMENT.md, docs/STORE_LISTING.md, docs/superpowers/…   (not published)
CHANGELOG.md, README.md, LICENSE (MIT, already on main)
.github/workflows/ci.yml            lint + unit + offline e2e on push/PR (blocking)
.github/workflows/site-smoke.yml    real-site smoke, nightly + manual (non-blocking for PRs)
package.json, package-lock.json, eslint.config.js, .prettierrc
```

Library files use the existing pattern: classic scripts that attach to `self.SL` (namespace
object) in the browser and `module.exports` under Node — no bundler, testable in `node:test`.
Load order in manifest/HTML: color → defaults → settings → theme-logic → filter → settings-store.

## Manifest (MV3)

```
manifest_version 3, name/description via __MSG_*__, default_locale "en", version "2.0.0",
minimum_chrome_version "111", permissions ["storage"], icons 16/32/48/128,
action { default_popup, default_icon, default_title },
options_ui { page: "options/options.html", open_in_tab: true },
content_scripts [{ matches: ["*://teams.scrumlaunch.com/*"], css, js, run_at: document_start, all_frames: true }]
```
No `host_permissions`, no background worker, no `web_accessible_resources`.

## Testing

Tests live in the task that builds the code they cover (TDD for pure code; e2e written
alongside each surface).

- Unit (node:test): color parsing + `contrastRatio`; matrix helpers (`compose`, `invert`,
  round-trips); `buildFilter` — white→background and black→text exactly (with and without
  hue rotation), identity shortcut, inverted detection, `inverseMatrix` undoes `matrix`
  including contrast/saturation, singular → identity + `'none'`, custom `filterId`;
  `normalizeSettings` — defaults, v1 migration, invalid colors/ranges, `keepColors` rule,
  unknown mode; `merge` — field-level merge of `mode` and each theme; `resolveTheme`.
- E2E (Playwright, Chromium with the unpacked extension, offline):
  - popup: default selection is Dark; clicking modes writes only `mode` (pre-seeded themes
    untouched); gear opens options; stubbed `storage.sync.set` failure → "Not saved".
  - options: renders defaults; changing dark background writes only `themes.dark`
    (pre-seeded `themes.light` and `mode` untouched); preview matrix updates; per-theme reset;
    reset-all; invalid hex → `aria-invalid`, no write; stubbed failure → "Not saved";
    low-contrast hint appears for `#1f1f1f` / `#2a2a2a`.
  - migration: seed legacy `{ mode: 'light' }`; open an **options tab** that stays open and
    registers a `chrome.storage.onChanged` counter; then open + reload the popup (top frame)
    → storage `settings` is `{ v: 2, mode: 'light', themes: DEFAULT_THEMES }`, legacy `mode`
    key absent, and the counter saw exactly one `settings` change.
- Real-site smoke (`tests/e2e/site.spec.js`, run by `site-smoke.yml` nightly and on demand,
  and locally with `E2E_SITE=1`; **not** part of the PR-blocking CI job because the site is a
  third party that can change): open https://teams.scrumlaunch.com/time-tracker
  unauthenticated (the app shell renders on the canvas without a login). `test.skip()` only
  when `page.goto` throws. Assertions the extension owns: `html[data-sl-theme="dark"]`
  present; body filter contains `url("#sl-matrix")`; poll until a pixel 8 px inside the
  `<canvas>` top-left is painted (not pure white); read that pixel with mode `light`
  (unfiltered, `p0`) and with mode `dark` (`p1`) and assert `p1 ≈ M(p0)` within ±12/255 per
  channel — a relative check that stays valid if the site changes its own colors.
- CI (`ci.yml`, blocking): lint, unit, offline e2e. No `continue-on-error`.

## Release checklist (in DEVELOPMENT.md)

1. `npm test` green; `npm run package` produces the zip; load the zip unpacked and click
   through popup + options.
2. **Performance checkpoint:** on the real site, record a DevTools Performance trace of
   scrolling the time-tracker list for ~5 s with mode `dark` and again with mode `light`;
   note both average frame times in the release notes. Ship only if the dark trace shows no
   sustained frames > 32 ms attributable to the filter. (One composed matrix is the cheapest
   filter chain possible; this step guards against regressions in Chrome's compositor path.)
3. Bump `version`, update CHANGELOG, tag, upload zip, paste STORE_LISTING fields.

## Documentation

- README: what it does, install from store / unpacked, usage, customization, how it works,
  limitations, development, license.
- docs/DEVELOPMENT.md: layout, scripts, testing, release checklist (above), versioning, the
  i18n note.
- site/privacy.md (published at the GitHub Pages URL, see plan) + docs/PRIVACY.md pointer:
  no data collected; settings stored in Chrome sync storage only. The Web Store developer
  dashboard requires a privacy-policy **URL**, not a file; the exact rendered URL is
  verified with a `curl` before it is written into STORE_LISTING.md. `docs/superpowers/` is
  never published (Pages root is `site/`).
- docs/STORE_LISTING.md: store title, summary (≤132 chars), description, category, screenshots
  list, single-purpose statement, permission justification (`storage`), the privacy-policy
  URL, the dashboard data-usage answers (no data collected / no remote code / not selling
  data), and the **affiliation position**: the listing name is "Dark Modern for ScrumLaunch
  Teams", the description carries "Not affiliated with or endorsed by ScrumLaunch" **unless**
  the author records written internal authorization in STORE_LISTING.md (the author works at
  ScrumLaunch; either path is acceptable to the Web Store, but one must be chosen and stated).

## Out of scope

Per-element colors, other sites, presets gallery, syncing across browsers other than Chrome
sync, Firefox/Safari builds, localized UI strings.
