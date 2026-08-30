# Development

## Layout

```
src/
  manifest.json                     MV3 manifest, version 2.0.0
  _locales/en/messages.json         extName, extDescription, actionTitle (manifest metadata only — see "i18n" below)
  icons/icon16.png                  toolbar/store icon, 16x16
  icons/icon32.png                  toolbar/store icon, 32x32
  icons/icon48.png                  toolbar/store icon, 48x48
  icons/icon128.png                 store listing icon, 128x128
  lib/color.js                      parseHex, toHex, isHex, luminance, contrastRatio
  lib/defaults.js                   MODES, DEFAULT_MODE, DEFAULT_THEMES, DEFAULT_SETTINGS, SETTINGS_VERSION, RANGE
  lib/settings.js                   normalizeSettings, normalizeTheme
  lib/theme-logic.js                resolveTheme(mode, systemPrefersDark); re-exports MODES/DEFAULT_MODE
  lib/filter.js                     buildFilter + matrix helpers (compose, invert, hueRotate180, saturate, contrast, tint, toFeValues)
  lib/settings-store.js             merge (pure); load/save/onChange over chrome.storage.sync
  content/content.js                injects the SVG filters, applies/updates the theme, reacts to storage + OS changes;
                                    reloads a page whose canvas images were decoded for a previous transform
  content/page.js                   MAIN-world script: wraps the page's ImageDecoder and HTMLImageElement.decode so
                                    photos the Flutter canvas paints are pre-corrected with the inverse matrix;
                                    flags html[data-sl-images]
  content/theme.css                 filter wiring + scrollbar theming, scoped to html[data-sl-theme]
  popup/popup.html, popup.css, popup.js       toolbar popup: Dark / Light / System + gear
  options/options.html, options.css, options.js   options page: per-theme cards, live preview, auto-save

tests/
  unit/*.test.js                    node:test, run with `npm run test:unit`
  e2e/fixtures/extension.js         Playwright fixture: launches Chromium with src/ loaded unpacked;
                                    extPage/openSettled, storage/seed helpers, installFailingSet
  e2e/*.spec.js                     popup, options, content, migration, fixture (offline) + site (network, opt-in)

scripts/
  package.sh                        zips src/ into dist/dark-modern-for-scrumlaunch-teams-<version>.zip
  screenshots.spec.js               Playwright spec: generates store/*.png
  screenshots.config.js             Playwright config used only for screenshots.spec.js (see "Screenshots" below)

site/
  index.md, privacy.md              GitHub Pages root (published site — not this repo's docs/)

docs/
  DEVELOPMENT.md                    this file
  STORE_LISTING.md                  Chrome Web Store listing copy and decisions
  PRIVACY.md                        pointer to the published privacy policy

.github/workflows/
  ci.yml                            lint + unit + offline e2e, on push and pull_request, blocking
  site-smoke.yml                    real-site smoke test, nightly (06:00 UTC) + manual dispatch

CHANGELOG.md, README.md, LICENSE (MIT), package.json, package-lock.json,
eslint.config.js, .prettierrc, playwright.config.js
```

## Scripts

| Script        | Command                                                  | What it does                                                                                     |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `lint`        | `eslint . && prettier --check .`                         | Lints the whole repo and fails if anything is unformatted.                                       |
| `format`      | `prettier -w .`                                          | Formats the whole repo.                                                                          |
| `test:unit`   | `node --test tests/unit/`                                | Runs the pure-logic unit tests (no browser).                                                     |
| `test:e2e`    | `playwright test`                                        | Runs the offline Playwright suite (`tests/e2e/`); `site.spec.js` self-skips unless `E2E_SITE=1`. |
| `test`        | `npm run test:unit && npm run test:e2e`                  | Everything CI runs on every push/PR.                                                             |
| `test:site`   | `E2E_SITE=1 playwright test tests/e2e/site.spec.js`      | Runs only the real-site smoke test, against network.                                             |
| `package`     | `scripts/package.sh`                                     | Builds the Web Store upload zip into `dist/`.                                                    |
| `screenshots` | `playwright test --config=scripts/screenshots.config.js` | Generates `store/options.png` and (with `E2E_SITE=1`) `store/site-dark.png`.                     |

## Testing

- **Unit** (`npm run test:unit`, `node:test`, no browser): color parsing and
  `contrastRatio`; the matrix helpers in `lib/filter.js` (`compose`, `invert`,
  round-trips); `buildFilter` (white→background, black→text, with/without hue
  rotation, the identity shortcut, inverted detection, the inverse matrix
  undoing the forward one including contrast/saturation, the singular →
  identity/`'none'` case, custom `filterId`); `normalizeSettings` (defaults,
  v1→v2 migration, invalid colors/ranges, the `keepColors` rule, unknown
  mode); `merge` (field-level merge of `mode` and each theme); `resolveTheme`.
- **Offline e2e** (`npm run test:e2e`, Playwright + Chromium with the unpacked
  extension, no network): popup, options and migration behavior — see the
  spec files in `tests/e2e/` for the exact assertions (default selections,
  field-level writes that never clobber the _other_ theme, serialized saves
  within a page, invalid-hex handling, low-contrast hints, failed-save error
  states, exactly-once v1→v2 migration). `content.spec.js` covers the content
  script offline by serving the site's URL from an in-memory fixture with
  `context.route` — Chrome injects the content script because the URL matches,
  so the top-frame/sub-frame behaviour is testable without network. The same
  fixture decodes a PNG through `ImageDecoder`, and another through a detached
  CORS `<img>` served from a routed cross-origin URL, into a `<canvas>` and
  samples the composited pixels, covering `content/page.js`'s pre-correction
  of both engine codecs and the
  reload-on-theme-change policy (immediate, or deferred while a text field is
  focused; the hidden-tab trigger itself cannot be reached in headless
  Chromium). This is
  what `ci.yml` runs on every push and pull request, and it must stay green
  with no network access.
- **Real-site smoke** (`npm run test:site`, i.e. `E2E_SITE=1 playwright test
tests/e2e/site.spec.js`): opens the real `teams.scrumlaunch.com/time-tracker`
  unauthenticated and asserts the composed matrix actually recolors sampled
  canvas pixels correctly, relative to the untransformed pixel — a check that
  stays valid even if the site changes its own colors. This is **not** part of
  `ci.yml` (a third-party site can be down, slow, or changed at any time; a
  blocking CI job must not depend on it) — it runs instead in
  `site-smoke.yml`, nightly at 06:00 UTC and on manual `workflow_dispatch`.
- **Screenshots** (`npm run screenshots`) is a Playwright spec but is not test
  coverage — it produces store listing images, not assertions, and is
  deliberately kept out of both `npm test` and CI. It runs against a separate
  config, `scripts/screenshots.config.js`, whose `testDir` is `scripts/`
  rather than `tests/e2e/`; this keeps `scripts/screenshots.spec.js` fully
  outside the default `playwright.config.js`'s `testDir: 'tests/e2e'`, so a
  bare `npx playwright test` / `npm run test:e2e` / `npm test` can never pick
  it up, while `npm run screenshots` (which passes `--config` explicitly)
  still finds it.

## No-bundler rule and the library pattern

There is no build step. Every file under `src/` is loaded exactly as it is
written — `chrome://extensions` → Load unpacked → `src/` must work with zero
transformation, and the content script's `js` array in `manifest.json` lists
the load order directly.

`src/lib/*.js` files follow one UMD-ish pattern so the same file works both as
a classic script the manifest/HTML loads in the browser and as a CommonJS
module `node:test` can `require()` directly:

```js
(function (root) {
  const dep = (root && root.SL && root.SL.dep) || (typeof require === 'function' && require('./dep.js'));
  // ...
  const api = { ... };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SL = root.SL || {}; root.SL.thisModule = api; }
})(typeof self !== 'undefined' ? self : this);
```

In the browser, every library attaches itself under the shared `self.SL`
namespace object (e.g. `SL.filter.buildFilter`); in Node, it exports the same
shape via `module.exports`, so a dependency resolves as `root.SL.dep` when
running as a script and via `require('./dep.js')` when running under
`node:test`. This means **load order matters** and must match the dependency
chain wired into `manifest.json`'s `content_scripts[0].js` (and mirrored in
`options.html`/`popup.html`):

```
color.js → defaults.js → settings.js → theme-logic.js → filter.js → settings-store.js → content.js
```

(`color.js` and `defaults.js` have no SL-namespace dependencies between them,
but every later file depends on at least one earlier one — see the `require`
lines at the top of each `src/lib/*.js` file for the exact edges.)

## Settings schema and migration

`chrome.storage.sync`, key `settings`:

```
{
  v: 2,
  mode: 'dark' | 'light' | 'system',
  themes: {
    dark:  { background, text, contrast, saturation, keepColors },
    light: { background, text, contrast, saturation, keepColors }
  }
}
```

`background`/`text` are strict `#rrggbb` hex; `contrast`/`saturation` are
50–150; `keepColors` is a boolean. `lib/settings.js`'s `normalizeSettings`
turns any stored value — including a legacy version-1 value that was just
`{ mode }` with no `v` at all — into a valid v2 object, so every reader works
without an explicit migration step. `settings-store.js`'s `load()`
additionally writes the normalized v2 object back to storage, but only when
there **is** stored data that is not already v2 **and** the caller is the top
frame (`window === window.top`), since the content script runs in every frame
of every tab and `chrome.storage.sync` has write quotas (120 ops/min,
1800/hour) that a naive per-frame write-back would blow through. A profile
with nothing stored writes nothing at all on load — there is nothing to
migrate. The write-back drops the legacy top-level `mode` key.

## Release checklist

1. `npm run lint && npm test` green; `npm run package` produces the zip; load the zip unpacked
   and click through popup + options.
2. **Performance checkpoint:** on the real site, record a DevTools Performance
   trace of scrolling the time-tracker list for ~5 s with mode `dark` and
   again with mode `light`; note both average frame times in the release
   notes. Ship only if the dark trace shows no sustained frames > 32 ms
   attributable to the filter. (One composed matrix is the cheapest filter
   chain possible; this step guards against regressions in Chrome's
   compositor path.)
3. Bump `version` in `src/manifest.json`, update `CHANGELOG.md`, tag
   (`vX.Y.Z`), upload the zip, paste the `docs/STORE_LISTING.md` fields into
   the Chrome Web Store developer dashboard.

## Versioning

`src/manifest.json`'s `version` is the single source of truth (`scripts/package.sh`
reads it to name the zip). The flow is: bump the version in
`src/manifest.json` → add an entry to `CHANGELOG.md` → tag the commit
`vX.Y.Z` → the tag and the manifest version must always match.

## i18n note

`src/_locales/en/messages.json` exists only so `manifest.json` can use
`__MSG_extName__` / `__MSG_extDescription__` / `__MSG_actionTitle__` — the
metadata fields the Chrome Web Store and `chrome://extensions` read before any
extension page has loaded. **UI strings in `popup/`, `options/` and
`content/` are hardcoded English**, not looked up via `chrome.i18n.getMessage`.
Do not assume `chrome.i18n` is the house style for in-app strings; only the
three manifest-metadata keys use it, by MV3 necessity (`default_locale` +
`_locales` is how a manifest gets a localized name/description at all).
