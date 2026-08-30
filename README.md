# Dark Modern for ScrumLaunch Teams

A Chrome extension that applies a customizable dark (or light) color theme to
**https://teams.scrumlaunch.com**, with per-theme color, contrast and saturation
controls and a Dark / Light / System switch.

Built by a ScrumLaunch team member for ScrumLaunch Teams users, with internal
authorization (see `docs/STORE_LISTING.md`).

## Screenshots

`store/options.png` (the options page) and `store/site-dark.png` (the site in
dark mode) are generated, not checked in — see "Development" below. Run
`npm run screenshots` (and `E2E_SITE=1 npm run screenshots` for the site shot)
to produce them locally.

## Install

**From the Chrome Web Store:** coming soon.

**Unpacked (developer install):**

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. **Load unpacked** → select the `src/` folder of this repo
4. Open https://teams.scrumlaunch.com — it renders in dark mode by default
5. Pin the extension icon; click it to switch **Dark / Light / System**

## Usage

- **Popup** (click the toolbar icon): a three-way Dark / Light / System switch,
  plus a ⚙ button that opens the options page. The choice is saved to
  `chrome.storage.sync`, so it follows your Chrome profile and applies
  instantly to every open tab of the site.
- **Options page** (the ⚙ button, or right-click the icon → Options): separate
  cards for the dark and the light theme, each with a live preview.

## Customization

Each theme (dark and light) has five independent settings:

- **Background** — the color the site's white background maps to.
- **Text** — the color the site's black text maps to.
- **Contrast** — 50–150, standard CSS `contrast()` semantics (100 = unchanged).
- **Saturation** — 50–150, standard CSS `saturate()` semantics (100 = unchanged).
- **Keep original colors** — when on, the site's own hues (blue stays blue,
  orange stays orange) are preserved by rotating hue 180° before the
  background/text mapping is applied; only meaningful when the theme is
  inverted (background darker than text).

The options page shows a live preview of each theme as you edit it, and warns
when a background/text pair would be hard to read (contrast ratio below 4.5:1,
or background equal to text).

The **light theme's factory default is background `#ffffff` / text `#000000` /
contrast 100 / saturation 100** — the identity transform — so out of the box
Light mode leaves the site completely untouched. Change any of its values to
customize light mode too.

Use **Reset to default** on a card to restore just that theme, or
**Reset all to defaults** to restore both.

## How it works

teams.scrumlaunch.com is a Flutter Web app rendered with CanvasKit: the entire
UI is painted into a single `<canvas>`, so ordinary per-element CSS cannot
recolor it — only a whole-page filter can. The content script injects an
inline SVG containing two `feColorMatrix` filters (`#sl-matrix`, the forward
transform, and `#sl-matrix-inverse`, its exact mathematical inverse) and
applies `filter: url("#sl-matrix")` to `<body>`. The forward matrix is the
composition of, in order: an optional hue rotation (180°, only when the theme
is inverted and "keep original colors" is on), a tint that maps white to the
theme's background color and black to its text color, a contrast adjustment,
and a saturation adjustment. The inverse matrix is applied to real DOM images,
video and elements with a CSS background-image, so photos and avatars outside
the canvas keep their original colors.

Photos the app paints _inside_ the canvas (profile avatars, uploaded logos,
the preview of a just-picked photo) are out of CSS's reach, so a second
content script (`content/page.js`, running in the page's own JavaScript world)
wraps the two browser decoders the Flutter engine turns raster images into
textures with — WebCodecs `ImageDecoder` for bytes it already holds, and a
detached `<img>` element's `decode()` for images it loads by URL, which is how
every avatar arrives — and runs each decoded image through the inverse matrix
before the engine gets it. The page filter then maps those pixels straight
back to the original photo. The only loss is in highlights brighter than the
theme's text color, which the filter cannot produce; they come out capped at
that brightness, so a photo looks gently dimmed rather than inverted. The
app's SVG icons and logos are drawn as vectors, never decoded as images, and
keep following the UI recolor — exactly what a dark theme wants from them.
Because Flutter keeps decoded images in its own cache, changing the theme
while such a page is open reloads it so the images are decoded for the new
transform; if you are typing in a field at that moment the reload waits until
you switch away from the tab.

Settings live in `chrome.storage.sync`
under a single `settings` key (schema version 2); a legacy version-1 setting
(`{ mode }` only) is migrated automatically the first time the extension loads
under the new version.

## Limitations

- Photos drawn **inside the canvas** are corrected on their way through the
  browser's decoders (`ImageDecoder`, or an `<img>` element for URL-loaded
  images whose server allows CORS — the site's asset bucket does), with
  highlights capped at the theme's text brightness; a theme change on an open
  page reloads it so cached images are decoded again. Vector artwork the app
  draws itself (its SVG icons, logos and illustrations) is recolored with the
  UI — a canvas-based whole-page filter cannot tell those pixels apart.
- Only `teams.scrumlaunch.com` is themed; the extension does not touch any
  other site.

## Development

```
npm ci                  # install dependencies
npm test                # unit tests + offline e2e tests
npm run test:site       # real-site smoke test (needs network)
npm run package         # build dist/dark-modern-for-scrumlaunch-teams-<version>.zip
```

See `docs/DEVELOPMENT.md` for the project layout, the full scripts table,
testing details, the release checklist, and versioning.

## License

MIT — see [LICENSE](./LICENSE).
