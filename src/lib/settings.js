// Settings normalization for theme customization. No side effects, no browser APIs.
(function (root) {
  const color =
    (root && root.SL && root.SL.color) || (typeof require === 'function' && require('./color.js'));
  const defaults =
    (root && root.SL && root.SL.defaults) ||
    (typeof require === 'function' && require('./defaults.js'));

  const { isHex } = color;
  const { MODES, DEFAULT_MODE, DEFAULT_THEMES } = defaults;

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /**
   * Normalize a single theme object against a default theme, applying the
   * field-level rules verbatim (colors, contrast/saturation, keepColors).
   * @param {*} raw - Untrusted input, may be undefined/null/non-object.
   * @param {object} defaultTheme - Fallback theme (e.g. DEFAULT_THEMES.dark).
   * @returns {{background: string, text: string, contrast: number, saturation: number, keepColors: boolean}}
   */
  function normalizeTheme(raw, defaultTheme) {
    const src = raw && typeof raw === 'object' ? raw : {};

    const normalizeColor = (field) =>
      isHex(src[field]) ? src[field].toLowerCase() : defaultTheme[field];
    const normalizeNumber = (field) => {
      const n = Number(src[field]);
      return Number.isFinite(n) ? clamp(n, 50, 150) : 100;
    };
    const keepColors = src.keepColors == null ? defaultTheme.keepColors : Boolean(src.keepColors);

    return {
      background: normalizeColor('background'),
      text: normalizeColor('text'),
      contrast: normalizeNumber('contrast'),
      saturation: normalizeNumber('saturation'),
      keepColors,
    };
  }

  /**
   * Normalize a settings object (any version, any shape) into the current
   * v2 schema: { v: 2, mode, themes: { dark, light } }. Always returns
   * fresh objects — never the frozen defaults themselves.
   * @param {*} raw - Untrusted stored settings, may be undefined/null/v1.
   * @returns {{v: 2, mode: string, themes: {dark: object, light: object}}}
   */
  function normalizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const rawThemes = src.themes && typeof src.themes === 'object' ? src.themes : DEFAULT_THEMES;

    const mode = MODES.includes(src.mode) ? src.mode : DEFAULT_MODE;

    return {
      v: 2,
      mode,
      themes: {
        dark: normalizeTheme(rawThemes.dark, DEFAULT_THEMES.dark),
        light: normalizeTheme(rawThemes.light, DEFAULT_THEMES.light),
      },
    };
  }

  const api = { normalizeSettings, normalizeTheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.SL = root.SL || {};
    root.SL.settings = api;
  }
})(typeof self !== 'undefined' ? self : this);
