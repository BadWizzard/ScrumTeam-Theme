const test = require('node:test');
const assert = require('node:assert/strict');
const defaults = require('../../src/lib/defaults.js');

test('MODES is frozen', () => {
  assert.equal(Object.isFrozen(defaults.MODES), true);
});

test('DEFAULT_THEMES and its nested theme objects are frozen', () => {
  assert.equal(Object.isFrozen(defaults.DEFAULT_THEMES), true);
  assert.equal(Object.isFrozen(defaults.DEFAULT_THEMES.dark), true);
  assert.equal(Object.isFrozen(defaults.DEFAULT_THEMES.light), true);
});

test('DEFAULT_SETTINGS and its nested themes are frozen', () => {
  assert.equal(Object.isFrozen(defaults.DEFAULT_SETTINGS), true);
  assert.equal(Object.isFrozen(defaults.DEFAULT_SETTINGS.themes.light), true);
});

test('RANGE is frozen', () => {
  assert.equal(Object.isFrozen(defaults.RANGE), true);
});

test('the module export object itself is frozen', () => {
  assert.equal(Object.isFrozen(defaults), true);
});
