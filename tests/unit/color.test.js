const test = require('node:test'); const assert = require('node:assert/strict');
const { parseHex, toHex, isHex, luminance, contrastRatio } = require('../../src/lib/color.js');
test('parseHex accepts #rrggbb (any case), rejects shorthand and garbage', () => {
  assert.deepEqual(parseHex('#1F1f1f'), { r: 31, g: 31, b: 31 });
  assert.equal(parseHex('#fff'), null); assert.equal(parseHex('1f1f1f'), null);
  assert.equal(parseHex('#12345'), null); assert.equal(parseHex(undefined), null);
});
test('toHex formats lowercase 6-digit', () => assert.equal(toHex({ r: 0, g: 120, b: 212 }), '#0078d4'));
test('isHex only accepts strict #rrggbb', () => { assert.equal(isHex('#0078D4'), true); assert.equal(isHex('#fff'), false); assert.equal(isHex(12), false); });
test('luminance: white 1, black 0, #1f1f1f dark', () => {
  assert.equal(luminance('#ffffff'), 1); assert.equal(luminance('#000000'), 0); assert.ok(luminance('#1f1f1f') < 0.02);
});
test('contrastRatio: white/black 21, same color 1, dark modern ≈ 10.26', () => {
  assert.equal(Math.round(contrastRatio('#ffffff', '#000000')), 21);
  assert.equal(contrastRatio('#1f1f1f', '#1f1f1f'), 1);
  assert.ok(Math.abs(contrastRatio('#1f1f1f', '#cccccc') - 10.26) < 0.05);
});
