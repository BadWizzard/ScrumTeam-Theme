# Theme Customization + Store Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users customize the dark and light themes (background/text colors, contrast, saturation, keep-colors), reset to defaults, and make the extension Chrome-Web-Store-ready with tests, docs, packaging and CI.

**Architecture:** Pure-function core (`lib/`: color, defaults, settings normalization, theme resolution, SVG feColorMatrix filter builder) shared by content script, popup and options page as classic scripts on a `self.SL` namespace (Node-testable via `module.exports`). Content script injects an inline SVG filter and drives `html[data-sl-theme]` + `--sl-filter`. Options page auto-saves normalized settings to `chrome.storage.sync`.

**Tech Stack:** Manifest V3, vanilla JS/CSS (no bundler), `node:test` for unit tests, `@playwright/test` for e2e (Chromium with the unpacked extension), ESLint + Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-24-theme-customization-and-store-readiness-design.md`

## Global Constraints

- Only permission: `storage`. Content script matches only `*://teams.scrumlaunch.com/*`. No `host_permissions`, no background worker, no remote code.
- No build step: `src/` must be loadable unpacked as-is.
- Library files: classic scripts attaching to `self.SL` in browsers and `module.exports` in Node. Load order: color → defaults → settings → theme-logic → filter → settings-store.
- Settings schema v2 exactly as in the spec; v1 `{ mode }` must migrate transparently.
- Contrast/saturation range 50..150; hex colors `#rrggbb` lowercased.
- Version `2.0.0`, `minimum_chrome_version` `110`, `default_locale` `en`.
- Commit after every task with a conventional-commit message and the Co-Authored-By trailer.

---

### Task 1: Project scaffold (src/ layout, package.json, lint, test runners)

**Files:**
- Move: `manifest.json, icons/, theme-logic.js, content.js, theme.css, popup.*` → `src/…` per spec layout
- Create: `package.json`, `eslint.config.js`, `.prettierrc`, `LICENSE`, `.gitignore` (update)
- Move test: `test/theme-logic.test.js` → `tests/unit/theme-logic.test.js`

- [ ] Step 1: `git mv` files into `src/lib`, `src/content`, `src/popup`, `src/icons`; update manifest paths (`content/theme.css`, `lib/theme-logic.js`, `content/content.js`, `popup/popup.html`, `icons/…`), popup.html script src → `../lib/theme-logic.js`.
- [ ] Step 2: `package.json` with scripts: `lint` (eslint), `format`, `test:unit` (`node --test tests/unit/`), `test:e2e` (`playwright test`), `test`, `package` (`scripts/package.sh`), devDeps `@playwright/test`, `eslint`, `prettier`, `globals`.
- [ ] Step 3: `eslint.config.js` flat config: browser + webextensions globals for `src/`, node globals for tests/scripts.
- [ ] Step 4: Run `npm install`, `npm run lint`, `npm run test:unit` → both pass (fix the moved test's require path).
- [ ] Step 5: Commit `chore: restructure into src/ with npm tooling`.

### Task 2: `lib/color.js`

**Produces:** `SL.color = { parseHex(str) → {r,g,b} in 0..255 | null, toHex({r,g,b}) → '#rrggbb', isHex(str) → boolean, luminance('#rrggbb') → 0..1 (WCAG relative luminance) }`

- [ ] Step 1: Write `tests/unit/color.test.js`:
```js
const test = require('node:test'); const assert = require('node:assert/strict');
const { parseHex, toHex, isHex, luminance } = require('../../src/lib/color.js');
test('parseHex accepts #rrggbb and #RGB, rejects garbage', () => {
  assert.deepEqual(parseHex('#1F1f1f'), { r: 31, g: 31, b: 31 });
  assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255 });
  assert.equal(parseHex('1f1f1f'), null); assert.equal(parseHex('#12345'), null); assert.equal(parseHex(undefined), null);
});
test('toHex formats lowercase 6-digit', () => assert.equal(toHex({ r: 0, g: 120, b: 212 }), '#0078d4'));
test('isHex only accepts strict #rrggbb', () => { assert.equal(isHex('#0078d4'), true); assert.equal(isHex('#fff'), false); });
test('luminance: white 1, black 0, #1f1f1f dark', () => {
  assert.equal(luminance('#ffffff'), 1); assert.equal(luminance('#000000'), 0); assert.ok(luminance('#1f1f1f') < 0.02);
});
```
- [ ] Step 2: Run → fails (module missing).
- [ ] Step 3: Implement with the UMD-style wrapper (`self.SL = self.SL || {}; SL.color = api`).
- [ ] Step 4: Run → pass. Commit `feat: color helpers`.

### Task 3: `lib/defaults.js` + `lib/settings.js` (normalizeSettings)

**Produces:** `SL.defaults = { DEFAULT_THEMES: { dark, light }, DEFAULT_SETTINGS, SETTINGS_VERSION: 2, RANGE: { min: 50, max: 150 } }`, `SL.settings = { normalizeSettings(raw) → settings, normalizeTheme(raw, defaults) → theme }`. Note: `normalizeSettings` needs `SL.theme.MODES`; to respect load order, `settings.js` defines its own `MODES` constant and `theme-logic.js` re-exports it. (In Node, `settings.js` requires `./theme-logic.js` — fine.)

- [ ] Step 1: Write `tests/unit/settings.test.js` covering: `normalizeSettings(undefined)` equals `DEFAULT_SETTINGS` (deep equal, not same reference); v1 `{ mode: 'light' }` → v2 with mode light and default themes; invalid color → default for that field; `contrast: 999` → 150, `'abc'` → 100; `keepColors: 'no'` → true (default) and `0` → false; unknown mode → `'dark'`; uppercase hex lowercased; extra keys dropped.
- [ ] Step 2: Run → fail. Step 3: Implement. Step 4: pass. Step 5: Commit `feat: settings defaults and normalization`.

### Task 4: `lib/filter.js` (buildFilter)

**Produces:** `SL.filter = { buildFilter(theme) → { css: string, matrix: number[20], inverted: boolean }, FILTER_ID: 'sl-matrix' }`.

- [ ] Step 1: Write `tests/unit/filter.test.js`:
```js
const { buildFilter } = require('../../src/lib/filter.js');
const DM = { background: '#1f1f1f', text: '#cccccc', contrast: 100, saturation: 100, keepColors: true };
const apply = (m, [r,g,b]) => [0,1,2].map(i => m[i*5]*r + m[i*5+1]*g + m[i*5+2]*b + m[i*5+4]);
test('white maps to background, black to text', () => {
  const { matrix } = buildFilter(DM);
  assert.deepEqual(apply(matrix,[1,1,1]).map(v=>Math.round(v*255)), [31,31,31]);
  assert.deepEqual(apply(matrix,[0,0,0]).map(v=>Math.round(v*255)), [204,204,204]);
});
test('dark theme is inverted and keeps colors via hue-rotate before the matrix', () => {
  const f = buildFilter(DM); assert.equal(f.inverted, true); assert.equal(f.css, 'hue-rotate(180deg) url("#sl-matrix")');
});
test('keepColors=false drops hue-rotate', () => assert.equal(buildFilter({...DM, keepColors:false}).css, 'url("#sl-matrix")'));
test('light default is identity → none', () => {
  const f = buildFilter({ background:'#ffffff', text:'#000000', contrast:100, saturation:100, keepColors:true });
  assert.equal(f.css, 'none'); assert.equal(f.inverted, false);
});
test('light non-identity has no hue-rotate, appends contrast/saturate when ≠100', () => {
  const f = buildFilter({ background:'#f5efe0', text:'#222222', contrast:110, saturation:90, keepColors:true });
  assert.equal(f.inverted, false); assert.equal(f.css, 'url("#sl-matrix") contrast(110%) saturate(90%)');
});
test('matrix alpha row is identity', () => assert.deepEqual(buildFilter(DM).matrix.slice(15), [0,0,0,1,0]));
```
- [ ] Step 2: fail. Step 3: implement (matrix rows `[bg-text,0,0,0,text]` per channel, `inverted = luminance(bg) < luminance(text)`, identity check). Step 4: pass. Step 5: Commit `feat: feColorMatrix filter builder`.

### Task 5: `lib/theme-logic.js` re-export + `lib/settings-store.js`

- [ ] Step 1: `theme-logic.js`: keep `resolveTheme`, `MODES`, `DEFAULT_MODE`; attach as `SL.theme`; keep `SLTheme` alias out (update consumers). Existing tests still pass.
- [ ] Step 2: `settings-store.js`: `SL.store = { load(), save(settings), onChange(cb) }` — `load` reads `settings` and legacy `mode`, returns `normalizeSettings(...)`, and if the stored value was not already v2 writes the normalized object back; `save` normalizes then `chrome.storage.sync.set({ settings })`; `onChange` wraps `chrome.storage.onChanged` filtered to area `sync` and key `settings`, passing normalized `newValue`. Browser-only; covered by e2e.
- [ ] Step 3: Commit `feat: settings store`.

### Task 6: Content script + theme.css (SVG filter injection)

**Files:** `src/content/content.js`, `src/content/theme.css`, `src/manifest.json` (js load order)

- [ ] Step 1: `content.js`:
```js
(function () {
  const { resolveTheme } = SL.theme, { buildFilter, FILTER_ID } = SL.filter, store = SL.store;
  const media = matchMedia('(prefers-color-scheme: dark)');
  let settings = null;
  function ensureSvg() {
    let svg = document.getElementById('sl-theme-svg');
    if (svg) return svg.querySelector('feColorMatrix');
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'sl-theme-svg'; svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
    const f = document.createElementNS(svg.namespaceURI, 'filter');
    f.id = FILTER_ID; f.setAttribute('color-interpolation-filters', 'sRGB');
    const m = document.createElementNS(svg.namespaceURI, 'feColorMatrix'); m.setAttribute('type', 'matrix');
    f.appendChild(m); svg.appendChild(f); document.documentElement.appendChild(svg);
    return m;
  }
  function apply() {
    if (!settings) return;
    const name = resolveTheme(settings.mode, media.matches);
    const theme = settings.themes[name];
    const { css, matrix, inverted } = buildFilter(theme);
    const root = document.documentElement;
    if (css === 'none') { root.removeAttribute('data-sl-theme'); root.style.removeProperty('--sl-filter'); root.style.removeProperty('--sl-bg'); return; }
    ensureSvg().setAttribute('values', matrix.join(' '));
    root.style.setProperty('--sl-filter', css); root.style.setProperty('--sl-bg', theme.background);
    root.setAttribute('data-sl-theme', inverted ? 'dark' : 'light');
  }
  store.load().then(s => { settings = s; apply(); });
  store.onChange(s => { settings = s; apply(); });
  media.addEventListener('change', apply);
})();
```
- [ ] Step 2: `theme.css`: `html[data-sl-theme] { background: var(--sl-bg) !important; } html[data-sl-theme="dark"] { color-scheme: dark; } html[data-sl-theme] body { filter: var(--sl-filter); min-height: 100vh; }` + existing dark scrollbar rules.
- [ ] Step 3: Manifest `js` order: `lib/color.js, lib/defaults.js, lib/settings.js, lib/theme-logic.js, lib/filter.js, lib/settings-store.js, content/content.js`.
- [ ] Step 4: Manual check via Playwright smoke (Task 10) — but do a quick headed run now: body filter contains `url("#sl-matrix")` and page is dark. If the `<base>` breaks the reference, implement the absolute-URL fallback described in the spec.
- [ ] Step 5: Commit `feat: content script applies SVG color-matrix theme`.

### Task 7: Popup update (gear → options)

- [ ] Step 1: `popup.html` scripts: lib files in load order + `popup.js`; add `<button id="open-options" aria-label="Customize colors">⚙</button>` in header. `popup.js`: use `SL.store.load/save` (write whole settings with new `mode`), `open-options` → `chrome.runtime.openOptionsPage()`.
- [ ] Step 2: Commit `feat: popup gear opens options`.

### Task 8: Options page

**Files:** `src/options/options.html|css|js`, manifest `options_ui`.

- [ ] Step 1: HTML: header (title + one-line canvas note), `<main class="cards">` with a `<section class="card" data-theme="dark">` and `data-theme="light"`; each with inputs named by `data-field`: `background` (color + text), `text` (color + text), `contrast` (range 50–150 step 5 + `<output>`), `saturation` (same), `keepColors` (checkbox), a `.preview` block (inline SVG filter with id `sl-matrix-dark`/`sl-matrix-light`, sample: app bar, heading, paragraph, primary button, link, orange badge, 24px data-URI image), and `button.reset-theme`. Footer: `button#reset-all`, `span#status aria-live="polite"`.
- [ ] Step 2: `options.js`: `render(settings)` fills inputs; input/change handlers → `readForm()` → `normalizeSettings` → `save` (debounced 150 ms) → `status.textContent='Saved'`; `updatePreview(name)` sets the preview's `feColorMatrix.values` and `style.filter` (`css` with `url("#sl-matrix-<name>")`); reset-theme → `DEFAULT_THEMES[name]`; reset-all → `DEFAULT_SETTINGS`. Hex text input: on `input`, if `isHex` → sync color picker + save; else mark `aria-invalid`.
- [ ] Step 3: `options.css`: Dark Modern palette, two-column grid ≥ 900px, focus rings, labels.
- [ ] Step 4: Manifest: `"options_ui": { "page": "options/options.html", "open_in_tab": true }`.
- [ ] Step 5: Commit `feat: options page with live preview and resets`.

### Task 9: Manifest polish + i18n + icons

- [ ] Step 1: `_locales/en/messages.json` with `extName`, `extDescription`, `actionTitle`; manifest uses `__MSG_extName__` etc., `default_locale: "en"`, `version: "2.0.0"`, `minimum_chrome_version: "110"`, `homepage_url` placeholder = repo URL, icons 16/32/48/128 (generate 32 with the existing PIL script).
- [ ] Step 2: Commit `chore: manifest metadata, locales, icons`.

### Task 10: E2E tests (Playwright)

**Files:** `playwright.config.js`, `tests/e2e/fixtures/extension.js`, `tests/e2e/popup.spec.js`, `tests/e2e/options.spec.js`, `tests/e2e/site.spec.js`

- [ ] Step 1: Fixture: `test.extend` with `context` = `chromium.launchPersistentContext('', { channel: 'chromium', args: [--disable-extensions-except, --load-extension], headless: true (new headless) })`, `extensionId` computed from `sha256(path)` → a–p mapping (same as manifest key-less unpacked ids).
- [ ] Step 2: popup.spec: default Dark checked; click Light → storage `settings.mode==='light'` (read via `page.evaluate(() => chrome.storage.sync.get('settings'))` in the popup page); gear click opens a page whose URL ends with `options/options.html`.
- [ ] Step 3: options.spec: defaults rendered; set dark background hex to `#101820` → storage updated and preview filter matrix first value equals `(0x10-0xcc)/255`; per-theme reset restores `#1f1f1f`; reset-all restores mode dark; invalid hex → `aria-invalid="true"` and storage unchanged.
- [ ] Step 4: site.spec (skips when `process.env.E2E_SITE === '0'`; also `test.skip` if navigation fails): open https://teams.scrumlaunch.com/time-tracker, wait 5 s, expect `html[data-sl-theme="dark"]`, `getComputedStyle(body).filter` contains `url("#sl-matrix")`, screenshot pixel at (700,270) ≈ configured background (site bg is off-white so allow ±12/255); set mode light via storage → attribute removed.
- [ ] Step 5: `npm run test:e2e` passes. Commit `test: e2e for popup, options, site`.

### Task 11: Packaging, CI, docs

- [ ] Step 1: `scripts/package.sh`: reads version from `src/manifest.json`, `zip -r dist/scrumlaunch-teams-dark-modern-<v>.zip` from inside `src/` excluding nothing else. `scripts/screenshots.spec.js` (Playwright, tagged, run via `npm run screenshots`): 1280×800 shots of options page and site (if reachable) into `store/`.
- [ ] Step 2: `.github/workflows/ci.yml`: node 20, `npm ci`, `npx playwright install --with-deps chromium`, lint, unit, e2e (`E2E_SITE=1`, `continue-on-error` only for the site spec via separate step).
- [ ] Step 3: Docs: rewrite `README.md`; add `docs/DEVELOPMENT.md`, `docs/PRIVACY.md`, `docs/STORE_LISTING.md`, `CHANGELOG.md`.
- [ ] Step 4: Run `npm test`, `npm run package`, verify zip contents. Commit `docs: store listing, privacy, development guide; ci; packaging`.
