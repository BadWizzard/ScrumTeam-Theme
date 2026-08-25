const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSettings, normalizeTheme } = require('../../src/lib/settings.js');
const { DEFAULT_SETTINGS, DEFAULT_THEMES } = require('../../src/lib/defaults.js');

test('normalizeSettings(undefined) deep-equals DEFAULT_SETTINGS but is not the same reference', () => {
  const result = normalizeSettings(undefined);
  assert.deepEqual(result, DEFAULT_SETTINGS);
  assert.notEqual(result, DEFAULT_SETTINGS);
  assert.notEqual(result.themes, DEFAULT_SETTINGS.themes);
  assert.notEqual(result.themes.dark, DEFAULT_SETTINGS.themes.dark);
});

test('v1 object { mode: "light" } (no v, no themes) migrates to v2 with default themes', () => {
  const result = normalizeSettings({ mode: 'light' });
  assert.deepEqual(result, {
    v: 2,
    mode: 'light',
    themes: DEFAULT_THEMES,
  });
});

test('invalid color falls back to default for that field', () => {
  const result = normalizeSettings({
    themes: { dark: { background: 'not-a-color' }, light: { text: 'nope' } },
  });
  assert.equal(result.themes.dark.background, DEFAULT_THEMES.dark.background);
  assert.equal(result.themes.light.text, DEFAULT_THEMES.light.text);
});

test('contrast 999 clamps to 150, "abc" falls back to 100', () => {
  const result = normalizeSettings({
    themes: { dark: { contrast: 999 }, light: { contrast: 'abc' } },
  });
  assert.equal(result.themes.dark.contrast, 150);
  assert.equal(result.themes.light.contrast, 100);
});

test('saturation 999 clamps to 150, "abc" falls back to 100', () => {
  const result = normalizeSettings({
    themes: { dark: { saturation: 999 }, light: { saturation: 'abc' } },
  });
  assert.equal(result.themes.dark.saturation, 150);
  assert.equal(result.themes.light.saturation, 100);
});

test('saturation below range clamps to 50', () => {
  const result = normalizeSettings({ themes: { dark: { saturation: 1 } } });
  assert.equal(result.themes.dark.saturation, 50);
});

test('keepColors: missing -> true, null -> true, "no" -> true, 0 -> false, false -> false', () => {
  const missing = normalizeSettings({ themes: { dark: {} } });
  assert.equal(missing.themes.dark.keepColors, true);

  const isNull = normalizeSettings({ themes: { dark: { keepColors: null } } });
  assert.equal(isNull.themes.dark.keepColors, true);

  const truthyString = normalizeSettings({ themes: { dark: { keepColors: 'no' } } });
  assert.equal(truthyString.themes.dark.keepColors, true);

  const zero = normalizeSettings({ themes: { dark: { keepColors: 0 } } });
  assert.equal(zero.themes.dark.keepColors, false);

  const falseVal = normalizeSettings({ themes: { dark: { keepColors: false } } });
  assert.equal(falseVal.themes.dark.keepColors, false);
});

test('unknown mode falls back to "dark"', () => {
  const result = normalizeSettings({ mode: 'bogus' });
  assert.equal(result.mode, 'dark');
});

test('uppercase hex is lowercased', () => {
  const result = normalizeSettings({ themes: { dark: { background: '#1F1F1F' } } });
  assert.equal(result.themes.dark.background, '#1f1f1f');
});

test('shorthand hex #fff is invalid and falls back to default', () => {
  const result = normalizeSettings({ themes: { dark: { background: '#fff' } } });
  assert.equal(result.themes.dark.background, DEFAULT_THEMES.dark.background);
});

test('extra keys are dropped; result has exactly the schema keys', () => {
  const result = normalizeSettings({
    v: 2,
    mode: 'dark',
    extra: 'nope',
    themes: {
      dark: {
        background: '#111111',
        text: '#eeeeee',
        contrast: 100,
        saturation: 100,
        keepColors: true,
        bogus: 1,
      },
      light: DEFAULT_THEMES.light,
    },
  });
  assert.deepEqual(Object.keys(result).sort(), ['mode', 'themes', 'v']);
  assert.deepEqual(Object.keys(result.themes).sort(), ['dark', 'light']);
  assert.deepEqual(
    Object.keys(result.themes.dark).sort(),
    ['background', 'contrast', 'keepColors', 'saturation', 'text'].sort(),
  );
});

test('themes: null falls back to default themes', () => {
  const result = normalizeSettings({ mode: 'dark', themes: null });
  assert.deepEqual(result.themes, DEFAULT_THEMES);
});

test('themes: non-object falls back to default themes', () => {
  const result = normalizeSettings({ mode: 'dark', themes: 'nope' });
  assert.deepEqual(result.themes, DEFAULT_THEMES);
});

test('result always has v: 2 even if input v is something else', () => {
  const result = normalizeSettings({ v: 99, mode: 'dark' });
  assert.equal(result.v, 2);
});

test('normalizeTheme applies rules against the given default theme', () => {
  const result = normalizeTheme(
    { background: '#ABCDEF', contrast: 'abc', keepColors: null },
    DEFAULT_THEMES.dark,
  );
  assert.deepEqual(result, {
    background: '#abcdef',
    text: DEFAULT_THEMES.dark.text,
    contrast: 100,
    saturation: 100,
    keepColors: true,
  });
});

test('normalizeTheme(undefined, defaultTheme) returns a fresh copy of the default theme', () => {
  const result = normalizeTheme(undefined, DEFAULT_THEMES.dark);
  assert.deepEqual(result, DEFAULT_THEMES.dark);
  assert.notEqual(result, DEFAULT_THEMES.dark);
});
