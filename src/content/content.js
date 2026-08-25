// Applies the composed SVG color-matrix theme to teams.scrumlaunch.com according
// to the saved settings. The site is a Flutter Web (CanvasKit) app painted into a
// single <canvas>, so the whole page is recolored via one feColorMatrix filter on
// <body>; real DOM images/video get the inverse matrix so they keep their original
// colors. See docs/superpowers/specs/2026-08-24-theme-customization-and-store-readiness-design.md
// ("Content script" section) for the exact contract implemented here.
(function () {
  const { resolveTheme } = SL.theme, { buildFilter, FILTER_ID } = SL.filter, store = SL.store;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const media = matchMedia('(prefers-color-scheme: dark)');
  let settings = null;
  function makeFilter(svg, id) {
    const f = document.createElementNS(SVG_NS, 'filter'); f.id = id; f.setAttribute('color-interpolation-filters', 'sRGB');
    const m = document.createElementNS(SVG_NS, 'feColorMatrix'); m.setAttribute('type', 'matrix');
    f.appendChild(m); svg.appendChild(f); return m;
  }
  function ensureSvg() {
    let svg = document.getElementById('sl-theme-svg');
    if (svg) return { fwd: svg.querySelector(`#${FILTER_ID} feColorMatrix`), inv: svg.querySelector(`#${FILTER_ID}-inverse feColorMatrix`) };
    svg = document.createElementNS(SVG_NS, 'svg'); svg.id = 'sl-theme-svg'; svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
    const fwd = makeFilter(svg, FILTER_ID), inv = makeFilter(svg, `${FILTER_ID}-inverse`);
    document.documentElement.appendChild(svg);
    return { fwd, inv };
  }
  function apply() {
    if (!settings) return;
    const theme = settings.themes[resolveTheme(settings.mode, media.matches)];
    const { css, inverseCss, matrix, inverseMatrix, inverted, background } = buildFilter(theme);
    const root = document.documentElement;
    if (css === 'none') { root.removeAttribute('data-sl-theme'); for (const p of ['--sl-filter', '--sl-filter-inverse', '--sl-bg']) root.style.removeProperty(p); return; }
    const { fwd, inv } = ensureSvg();
    fwd.setAttribute('values', matrix.join(' ')); inv.setAttribute('values', inverseMatrix.join(' '));
    root.style.setProperty('--sl-filter', css); root.style.setProperty('--sl-filter-inverse', inverseCss);
    // The rendered background (M(white)), not theme.background: the <html>
    // background and the scrollbars sit outside the filtered subtree, so they
    // must match what the filter actually paints under contrast/saturation.
    root.style.setProperty('--sl-bg', background);
    root.setAttribute('data-sl-theme', inverted ? 'dark' : 'light');
  }
  store.load().then(s => { settings = s; apply(); }).catch(e => console.warn('[SL] load failed', e));
  store.onChange(s => { settings = s; apply(); });
  media.addEventListener('change', apply);
})();
