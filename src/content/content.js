// Applies the composed SVG color-matrix theme to teams.scrumlaunch.com according
// to the saved settings. The site is a Flutter Web (CanvasKit) app painted into a
// single <canvas>, so the whole page is recolored via one feColorMatrix filter on
// <body>; real DOM images/video get the inverse matrix so they keep their original
// colors. See docs/superpowers/specs/2026-08-24-theme-customization-and-store-readiness-design.md
// ("Content script" section) for the exact contract implemented here.
(function () {
  const { resolveTheme } = SL.theme,
    { buildFilter, FILTER_ID } = SL.filter,
    store = SL.store;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const RELOAD_KEY = 'sl-image-reload';
  const media = matchMedia('(prefers-color-scheme: dark)');
  let settings = null;
  // The transform this document's canvas images were decoded under (page.js
  // pre-corrects them for it); 'none' until the first apply().
  let imagesSig = 'none';
  function makeFilter(svg, id) {
    const f = document.createElementNS(SVG_NS, 'filter');
    f.id = id;
    f.setAttribute('color-interpolation-filters', 'sRGB');
    const m = document.createElementNS(SVG_NS, 'feColorMatrix');
    m.setAttribute('type', 'matrix');
    f.appendChild(m);
    svg.appendChild(f);
    return m;
  }
  function ensureSvg() {
    let svg = document.getElementById('sl-theme-svg');
    if (svg)
      return {
        fwd: svg.querySelector(`#${FILTER_ID} feColorMatrix`),
        inv: svg.querySelector(`#${FILTER_ID}-inverse feColorMatrix`),
      };
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.id = 'sl-theme-svg';
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute(
      'style',
      'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none',
    );
    const fwd = makeFilter(svg, FILTER_ID),
      inv = makeFilter(svg, `${FILTER_ID}-inverse`);
    document.documentElement.appendChild(svg);
    return { fwd, inv };
  }
  // Photos inside the Flutter canvas are pre-corrected by page.js at decode
  // time for the transform in force then, and Flutter caches the decoded
  // result: after the transform changes they can only be fixed by decoding
  // again, i.e. a reload. `data-sl-images` (set by page.js) means this
  // document holds such frames. Reload right away unless the user is in the
  // middle of typing — then wait until the tab is hidden, so a half-written
  // form is never thrown away under their cursor. One automatic reload per
  // 10 s per document, so an image decoded before apply() ran can't loop.
  function reloadForImages() {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
    } catch {
      /* storage unavailable (opaque origin): the guard just doesn't apply */
    }
    if (Date.now() - last < 10_000) return;
    const go = () => {
      try {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        /* see above */
      }
      location.reload();
    };
    const el = document.activeElement;
    const typing =
      !document.hidden &&
      el &&
      (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if (!typing) return go();
    document.addEventListener('visibilitychange', function onHide() {
      if (!document.hidden) return;
      document.removeEventListener('visibilitychange', onHide);
      go();
    });
  }
  function apply() {
    if (!settings) return;
    const theme = settings.themes[resolveTheme(settings.mode, media.matches)];
    const { css, inverseCss, matrix, inverseMatrix, inverted, background } = buildFilter(theme);
    const root = document.documentElement;
    const sig = css === 'none' ? 'none' : matrix.join(' ');
    const stale = sig !== imagesSig && root.hasAttribute('data-sl-images');
    imagesSig = sig;
    if (css === 'none') {
      root.removeAttribute('data-sl-theme');
      for (const p of ['--sl-filter', '--sl-filter-inverse', '--sl-bg'])
        root.style.removeProperty(p);
    } else {
      const { fwd, inv } = ensureSvg();
      fwd.setAttribute('values', matrix.join(' '));
      inv.setAttribute('values', inverseMatrix.join(' '));
      root.style.setProperty('--sl-filter', css);
      root.style.setProperty('--sl-filter-inverse', inverseCss);
      // The rendered background (M(white)), not theme.background: the <html>
      // background and the scrollbars sit outside the filtered subtree, so they
      // must match what the filter actually paints under contrast/saturation.
      root.style.setProperty('--sl-bg', background);
      root.setAttribute('data-sl-theme', inverted ? 'dark' : 'light');
    }
    if (stale) reloadForImages();
  }
  store
    .load()
    .then((s) => {
      settings = s;
      apply();
    })
    .catch((e) => console.warn('[SL] load failed', e));
  store.onChange((s) => {
    settings = s;
    apply();
  });
  media.addEventListener('change', apply);
})();
