// Settings persistence for theme customization: field-level merge, load/save,
// change notifications, and legacy-v1-to-v2 migration performed by the top frame.
// No browser APIs are touched at load time (Node loads this module for the
// `merge` unit test without `chrome` defined).
(function (root) {
  const settings =
    (root && root.SL && root.SL.settings) ||
    (typeof require === 'function' && require('./settings.js'));
  const defaults =
    (root && root.SL && root.SL.defaults) ||
    (typeof require === 'function' && require('./defaults.js'));
  if (!settings || !defaults) {
    throw new Error('[SL] settings-store.js requires settings.js and defaults.js to be loaded first');
  }
  const { normalizeSettings } = settings;
  const { SETTINGS_VERSION } = defaults;

  /**
   * Field-level merge of a patch onto a base settings object. Top-level keys
   * (e.g. `mode`) are replaced; `themes.dark`/`themes.light` are merged field
   * by field so a patch to one theme never clobbers the other. Never mutates
   * `base`.
   * @param {object} base
   * @param {object} patch
   * @returns {object}
   */
  function merge(base, patch) {
    const out = { ...base, ...patch, themes: { ...base.themes } };
    for (const k of ['dark', 'light']) {
      if (patch.themes && patch.themes[k]) out.themes[k] = { ...base.themes[k], ...patch.themes[k] };
    }
    return out;
  }

  function read() {
    return new Promise((res) => chrome.storage.sync.get(['settings', 'mode'], res));
  }

  function write(newSettings, removeKeys) {
    return new Promise((res, rej) =>
      chrome.storage.sync.set({ settings: newSettings }, () => {
        if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
        if (removeKeys) chrome.storage.sync.remove(removeKeys, () => res(newSettings));
        else res(newSettings);
      })
    );
  }

  /**
   * Load settings from chrome.storage.sync, normalizing to the current v2
   * schema. If the stored data is legacy (v1 `{ mode }` or absent) and this
   * frame is the top frame, migrate by writing the normalized v2 settings
   * and removing the legacy `mode` key.
   * @returns {Promise<object>}
   */
  async function load() {
    const raw = await read();
    const isV2 = !!raw.settings && raw.settings.v === SETTINGS_VERSION;
    const normalized = normalizeSettings(isV2 ? raw.settings : raw.settings || { mode: raw.mode });
    if (!isV2 && typeof window !== 'undefined' && window === window.top) {
      try {
        await write(normalized, ['mode']);
      } catch (e) {
        console.warn('[SL] migration write failed', e);
      }
    }
    return normalized;
  }

  async function save(patch) {
    const fresh = await load();
    return write(normalizeSettings(merge(fresh, patch)));
  }

  function onChange(cb) {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' && ch.settings) cb(normalizeSettings(ch.settings.newValue));
    });
  }

  const api = { merge, load, save, onChange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.SL = root.SL || {};
    root.SL.store = api;
  }
})(typeof self !== 'undefined' ? self : this);
