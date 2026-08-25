const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTheme, DEFAULT_MODE, MODES } = require('../../src/lib/theme-logic.js');

test('default mode is dark', () => {
  assert.equal(DEFAULT_MODE, 'dark');
});

test('exposes the three selectable modes', () => {
  assert.deepEqual(MODES, ['dark', 'light', 'system']);
});

test('dark mode resolves to dark regardless of system', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('dark', true), 'dark');
});

test('light mode resolves to light regardless of system', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('light', false), 'light');
});

test('system mode follows the OS preference', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

test('unknown or missing mode falls back to the default (dark)', () => {
  assert.equal(resolveTheme(undefined, false), 'dark');
  assert.equal(resolveTheme('bogus', false), 'dark');
});
