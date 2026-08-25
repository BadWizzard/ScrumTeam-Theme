// Pure theme logic shared by content.js and popup.js. No browser APIs here.
(function (root) {
  const MODES = ['dark', 'light', 'system'];
  const DEFAULT_MODE = 'dark';

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
  else root.SLTheme = api;
})(typeof self !== 'undefined' ? self : this);
