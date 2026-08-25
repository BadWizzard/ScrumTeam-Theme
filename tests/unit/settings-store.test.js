const test = require('node:test');
const assert = require('node:assert/strict');
const { merge } = require('../../src/lib/settings-store.js');
const { DEFAULT_SETTINGS } = require('../../src/lib/defaults.js');

test('merge replaces mode only', () => {
  const m = merge(DEFAULT_SETTINGS, { mode: 'light' });
  assert.equal(m.mode, 'light');
  assert.deepEqual(m.themes, DEFAULT_SETTINGS.themes);
});

test('merge patches one theme field and leaves the other theme untouched', () => {
  const base = {
    ...DEFAULT_SETTINGS,
    themes: {
      ...DEFAULT_SETTINGS.themes,
      light: { ...DEFAULT_SETTINGS.themes.light, background: '#f5efe0' },
    },
  };
  const m = merge(base, { themes: { dark: { background: '#101820' } } });
  assert.equal(m.themes.dark.background, '#101820');
  assert.equal(m.themes.dark.text, '#cccccc');
  assert.equal(m.themes.light.background, '#f5efe0');
});

test('merge does not mutate base', () => {
  const base = structuredClone(DEFAULT_SETTINGS);
  merge(base, { mode: 'light' });
  assert.deepEqual(base, DEFAULT_SETTINGS);
});
