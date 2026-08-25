// Composed feColorMatrix filter builder with exact inverse. No side effects, no browser APIs.
(function (root) {
  const color =
    (root && root.SL && root.SL.color) || (typeof require === 'function' && require('./color.js'));
  if (!color) {
    throw new Error('[SL] filter.js requires color.js to be loaded first');
  }
  const { parseHex, luminance } = color;

  const FILTER_ID = 'sl-matrix';

  function normZero(v) {
    return v === 0 ? 0 : v;
  }

  function identity() {
    return { a: [1, 0, 0, 0, 1, 0, 0, 0, 1], b: [0, 0, 0] };
  }

  /**
   * @param {string} bg - Hex background color.
   * @param {string} text - Hex text color.
   * @returns {{a: number[9], b: number[3]}}
   */
  function tint(bg, text) {
    const bgc = parseHex(bg);
    const txc = parseHex(text);
    const bgR = bgc.r / 255;
    const bgG = bgc.g / 255;
    const bgB = bgc.b / 255;
    const txR = txc.r / 255;
    const txG = txc.g / 255;
    const txB = txc.b / 255;
    return {
      a: [bgR - txR, 0, 0, 0, bgG - txG, 0, 0, 0, bgB - txB],
      b: [txR, txG, txB],
    };
  }

  /**
   * @param {number} k - Contrast factor, e.g. 1 = no change.
   * @returns {{a: number[9], b: number[3]}}
   */
  function contrast(k) {
    return {
      a: [k, 0, 0, 0, k, 0, 0, 0, k],
      b: [(1 - k) / 2, (1 - k) / 2, (1 - k) / 2],
    };
  }

  /**
   * @param {number} s - Saturation factor, e.g. 1 = no change, 0 = grayscale.
   * @returns {{a: number[9], b: number[3]}}
   */
  function saturate(s) {
    return {
      a: [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
      ],
      b: [0, 0, 0],
    };
  }

  /**
   * Filter Effects hue-rotate matrix at 180deg (cos = -1, sin = 0).
   * @returns {{a: number[9], b: number[3]}}
   */
  function hueRotate180() {
    return {
      a: [
        -0.574, 1.43, 0.144,
        0.426, 0.43, 0.144,
        0.426, 1.43, -0.856,
      ],
      b: [0, 0, 0],
    };
  }

  /**
   * Compose two affine transforms: apply q first, then p.
   * @param {{a: number[9], b: number[3]}} p
   * @param {{a: number[9], b: number[3]}} q
   * @returns {{a: number[9], b: number[3]}}
   */
  function compose(p, q) {
    const a = new Array(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        a[i * 3 + j] =
          p.a[i * 3 + 0] * q.a[0 * 3 + j] +
          p.a[i * 3 + 1] * q.a[1 * 3 + j] +
          p.a[i * 3 + 2] * q.a[2 * 3 + j];
      }
    }
    const b = [0, 1, 2].map(
      (i) => p.a[i * 3 + 0] * q.b[0] + p.a[i * 3 + 1] * q.b[1] + p.a[i * 3 + 2] * q.b[2] + p.b[i]
    );
    return { a, b };
  }

  /**
   * Invert an affine transform via the adjugate of its 3×3 matrix.
   * @param {{a: number[9], b: number[3]}} t
   * @returns {{a: number[9], b: number[3]} | null} - null if singular.
   */
  function invert(t) {
    const m = t.a;
    const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = m;
    const c00 = a4 * a8 - a5 * a7;
    const c01 = a5 * a6 - a3 * a8;
    const c02 = a3 * a7 - a4 * a6;
    const det = a0 * c00 + a1 * c01 + a2 * c02;
    if (Math.abs(det) < 1e-9) return null;

    const c10 = a2 * a7 - a1 * a8;
    const c11 = a0 * a8 - a2 * a6;
    const c12 = a1 * a6 - a0 * a7;
    const c20 = a1 * a5 - a2 * a4;
    const c21 = a2 * a3 - a0 * a5;
    const c22 = a0 * a4 - a1 * a3;

    const inv = [c00 / det, c10 / det, c20 / det, c01 / det, c11 / det, c21 / det, c02 / det, c12 / det, c22 / det];
    const b = [0, 1, 2].map(
      (i) => -(inv[i * 3 + 0] * t.b[0] + inv[i * 3 + 1] * t.b[1] + inv[i * 3 + 2] * t.b[2])
    );
    return { a: inv, b };
  }

  /**
   * Convert an affine transform to the 20-number feColorMatrix "values" list.
   * @param {{a: number[9], b: number[3]}} t
   * @returns {number[20]}
   */
  function toFeValues(t) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      out.push(
        normZero(t.a[i * 3]),
        normZero(t.a[i * 3 + 1]),
        normZero(t.a[i * 3 + 2]),
        0,
        normZero(t.b[i])
      );
    }
    out.push(0, 0, 0, 1, 0);
    return out;
  }

  const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

  /**
   * Build the composed feColorMatrix filter (and its exact inverse) for a theme.
   * @param {{background: string, text: string, contrast: number, saturation: number, keepColors: boolean}} theme
   * @param {string} [filterId]
   * @returns {{css: string, inverseCss: string, matrix: number[20], inverseMatrix: number[20], inverted: boolean}}
   */
  function buildFilter(theme, filterId = FILTER_ID) {
    const { background, text, contrast: contrastPct, saturation: saturationPct, keepColors } = theme;

    if (background === '#ffffff' && text === '#000000' && contrastPct === 100 && saturationPct === 100) {
      return {
        css: 'none',
        inverseCss: 'none',
        matrix: IDENTITY_MATRIX.slice(),
        inverseMatrix: IDENTITY_MATRIX.slice(),
        inverted: false,
      };
    }

    const inverted = luminance(background) < luminance(text);
    const base = inverted && keepColors ? hueRotate180() : identity();
    const withTint = compose(tint(background, text), base);
    const withContrast = compose(contrast(contrastPct / 100), withTint);
    const M = compose(saturate(saturationPct / 100), withContrast);

    const css = `url("#${filterId}")`;
    const inv = invert(M);
    const inverseMatrix = inv ? toFeValues(inv) : IDENTITY_MATRIX.slice();
    const inverseCss = inv ? `url("#${filterId}-inverse")` : 'none';

    return {
      css,
      inverseCss,
      matrix: toFeValues(M),
      inverseMatrix,
      inverted,
    };
  }

  const api = { buildFilter, FILTER_ID, compose, invert, hueRotate180, saturate, contrast, tint, toFeValues };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.SL = root.SL || {};
    root.SL.filter = api;
  }
})(typeof self !== 'undefined' ? self : this);
