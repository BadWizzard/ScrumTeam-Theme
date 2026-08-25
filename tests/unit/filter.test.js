const test = require('node:test'); const assert = require('node:assert/strict');
const F = require('../../src/lib/filter.js');
const DM = { background: '#1f1f1f', text: '#cccccc', contrast: 100, saturation: 100, keepColors: true };
const ID = { background: '#ffffff', text: '#000000', contrast: 100, saturation: 100, keepColors: true };
const applyFe = (m, [r, g, b]) => [0, 1, 2].map(i => m[i*5]*r + m[i*5+1]*g + m[i*5+2]*b + m[i*5+4]);
const close = (a, b, eps = 1e-9) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${a} vs ${b}`));

test('tint: white→background, black→text (no hue rotation)', () => {
  const { matrix } = F.buildFilter({ ...DM, keepColors: false });
  close(applyFe(matrix, [1, 1, 1]).map(v => Math.round(v * 255)), [31, 31, 31]);
  close(applyFe(matrix, [0, 0, 0]).map(v => Math.round(v * 255)), [204, 204, 204]);
});
test('white and black still map exactly with hue rotation (rows of H sum to 1)', () => {
  const { matrix } = F.buildFilter(DM);
  close(applyFe(matrix, [1, 1, 1]).map(v => Math.round(v * 255)), [31, 31, 31]);
  close(applyFe(matrix, [0, 0, 0]).map(v => Math.round(v * 255)), [204, 204, 204]);
});
test('keepColors keeps a blue pixel blue-dominant after inversion', () => {
  const [r, g, b] = applyFe(F.buildFilter(DM).matrix, [0, 0, 1]);
  assert.ok(b > r && b > g);
});
test('inverted flag and css strings', () => {
  const f = F.buildFilter(DM);
  assert.equal(f.inverted, true); assert.equal(f.css, 'url("#sl-matrix")'); assert.equal(f.inverseCss, 'url("#sl-matrix-inverse")');
  const g = F.buildFilter(DM, 'sl-matrix-dark');
  assert.equal(g.css, 'url("#sl-matrix-dark")'); assert.equal(g.inverseCss, 'url("#sl-matrix-dark-inverse")');
});
test('identity theme → none and identity matrix', () => {
  const f = F.buildFilter(ID);
  assert.equal(f.css, 'none'); assert.equal(f.inverseCss, 'none'); assert.equal(f.inverted, false);
  assert.deepEqual(f.matrix, [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0]);
});
test('contrast 150 keeps mid-gray fixed and stretches', () => {
  const { matrix } = F.buildFilter({ ...ID, contrast: 150 });
  close(applyFe(matrix, [0.5, 0.5, 0.5]), [0.5, 0.5, 0.5]);
  close(applyFe(matrix, [0.75, 0.75, 0.75]), [0.875, 0.875, 0.875]);
});
test('saturation 0-ish desaturates toward luma (saturate(0.5) halves chroma)', () => {
  const { matrix } = F.buildFilter({ ...ID, saturation: 50 });
  const [r, g, b] = applyFe(matrix, [1, 0, 0]);
  assert.ok(r < 1 && g > 0 && b > 0);
});
test('inverse matrix undoes the forward matrix, including contrast and saturation', () => {
  const t = { ...DM, contrast: 120, saturation: 80 };
  const { matrix, inverseMatrix } = F.buildFilter(t);
  for (const px of [[1,1,1],[0,0,0],[0.2,0.5,0.9],[0.7,0.1,0.3]]) close(applyFe(inverseMatrix, applyFe(matrix, px)), px, 1e-7);
});
test('singular theme (bg == text on a channel) → identity inverse and inverseCss none', () => {
  const f = F.buildFilter({ background: '#ff0000', text: '#ff8080', contrast: 100, saturation: 100, keepColors: true });
  assert.equal(f.inverseCss, 'none'); assert.deepEqual(f.inverseMatrix.slice(0, 5), [1,0,0,0,0]);
});
test('matrix alpha row is identity', () => assert.deepEqual(F.buildFilter(DM).matrix.slice(15), [0,0,0,1,0]));
test('helpers: compose then invert round-trips', () => {
  const m = F.compose(F.saturate(1.3), F.compose(F.contrast(0.8), F.hueRotate180()));
  const inv = F.invert(m); const p = [0.3, 0.6, 0.9];
  const ap = (t, v) => [0,1,2].map(i => t.a[i*3]*v[0] + t.a[i*3+1]*v[1] + t.a[i*3+2]*v[2] + t.b[i]);
  close(ap(inv, ap(m, p)), p, 1e-9);
  assert.equal(F.invert({ a: [1,0,0, 0,0,0, 0,0,1], b: [0,0,0] }), null);
});
