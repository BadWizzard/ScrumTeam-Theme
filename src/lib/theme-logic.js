// Pure theme logic shared by content.js and popup.js. No browser APIs here.
(function (root) {
  const defaults =
    (root && root.SL && root.SL.defaults) ||
    (typeof require === 'function' && require('./defaults.js'));
  if (!defaults) {
    throw new Error('[SL] theme-logic.js requires defaults.js to be loaded first');
  }
  const { MODES, DEFAULT_MODE } = defaults;

  /**
   * @param {string|undefined} mode  'dark' | 'light' | 'system'
   * @param {boolean} systemPrefersDark
   * @returns {'dark'|'light'}
   */
  function resolveTheme(mode, systemPrefersDark) {
    if (!MODES.includes(mode)) mode = DEFAULT_MODE;
    if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
    return mode;
  }

  const api = { MODES, DEFAULT_MODE, resolveTheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.SL = root.SL || {};
    root.SL.theme = api;
  }
})(typeof self !== 'undefined' ? self : this);
