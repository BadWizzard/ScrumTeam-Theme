// Shared defaults and constants for theme customization settings.
// No side effects, no browser APIs. Owns MODES/DEFAULT_MODE so settings.js
// and theme-logic.js can read them without duplicating the constants.
(function (root) {
  const MODES = ['dark', 'light', 'system'];
  const DEFAULT_MODE = 'dark';

  const DEFAULT_THEMES = {
    dark: {
      background: '#1f1f1f',
      text: '#cccccc',
      contrast: 100,
      saturation: 100,
      keepColors: true,
    },
    light: {
      background: '#ffffff',
      text: '#000000',
      contrast: 100,
      saturation: 100,
      keepColors: true,
    },
  };

  const SETTINGS_VERSION = 2;

  const DEFAULT_SETTINGS = {
    v: SETTINGS_VERSION,
    mode: DEFAULT_MODE,
    themes: DEFAULT_THEMES,
  };

  const RANGE = { min: 50, max: 150 };

  // Deep-freeze so nobody can mutate the shared defaults; consumers that
  // need a mutable copy (e.g. normalizeSettings) must clone first.
  function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((key) => {
      const value = obj[key];
      if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
  }

  deepFreeze(MODES);
  deepFreeze(DEFAULT_THEMES);
  deepFreeze(DEFAULT_SETTINGS);
  deepFreeze(RANGE);

  const api = {
    MODES,
    DEFAULT_MODE,
    DEFAULT_THEMES,
    DEFAULT_SETTINGS,
    SETTINGS_VERSION,
    RANGE,
  };

  deepFreeze(api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.SL = root.SL || {};
    root.SL.defaults = api;
  }
})(typeof self !== 'undefined' ? self : this);
