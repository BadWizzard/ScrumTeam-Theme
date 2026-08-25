# ScrumLaunch Teams — Dark Modern

Chrome extension that gives **https://teams.scrumlaunch.com** a dark theme using the
VS Code / Cursor **"Default Dark Modern"** palette, with a Dark / Light / System switch.

## Install (local, unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. **Load unpacked** → select this folder
4. Open https://teams.scrumlaunch.com — it is dark by default.
5. Pin the extension icon; click it to switch **Dark / Light / System**.

The choice is saved in `chrome.storage.sync`, so it follows your Chrome profile.
Changes apply instantly to all open tabs of the site.

## How it works

The site is a Flutter Web app rendered with **CanvasKit** — the whole UI is painted into a
single `<canvas>`, so per-element CSS can't recolor it. `theme.css` instead applies a
calibrated filter to the page:

- `invert(0.878)` maps the site's white `#FFFFFF` → `#1F1F1F` (Dark Modern editor bg)
  and black text → `#E0E0E0`
- `hue-rotate(180deg)` keeps hues stable (blue stays blue, orange stays orange)

Everything is scoped to `html[data-sl-theme="dark"]`; **Light** mode simply removes the
attribute, leaving the original site untouched. Known trade-off: images drawn inside the
canvas (avatars, illustrations) are inverted too — unavoidable with CanvasKit.

| File | Role |
|---|---|
| `manifest.json` | MV3; content script limited to `*://teams.scrumlaunch.com/*` |
| `theme-logic.js` | Pure logic: `resolveTheme(mode, systemPrefersDark)`; default `dark` |
| `content.js` | Reads saved mode, sets/removes the `data-sl-theme` attribute, reacts to storage and OS changes |
| `theme.css` | The dark theme (filter + scrollbars) |
| `popup.*` | Toolbar popup with the three-way switch |

## Tests

```
node --test test/
```

## Tuning

Want it darker/lighter? Change the `invert(...)` amount in `theme.css`:
white → `1 - amount`, e.g. `0.878` → `#1F1F1F`, `0.90` → `#1A1A1A`, `0.85` → `#262626`.
