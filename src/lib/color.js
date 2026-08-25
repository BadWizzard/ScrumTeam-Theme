// Pure color helpers for theme customization. No side effects, no browser APIs.
(function (root) {
  /**
   * Parse a hex color string to {r, g, b} object.
   * Only accepts strict #rrggbb format (case-insensitive).
   * @param {string} str - Color string like '#1f1f1f'
   * @returns {{r: number, g: number, b: number} | null}
   */
  function parseHex(str) {
    if (typeof str !== 'string') return null;
    const match = str.match(/^#([0-9a-fA-F]{6})$/);
    if (!match) return null;
    const hex = match[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  /**
   * Format {r, g, b} object to hex color string.
   * @param {{r: number, g: number, b: number}} rgb
   * @returns {string} - Lowercase '#rrggbb'
   */
  function toHex(rgb) {
    const toHexByte = (n) => Math.round(n).toString(16).padStart(2, '0');
    return `#${toHexByte(rgb.r)}${toHexByte(rgb.g)}${toHexByte(rgb.b)}`;
  }

  /**
   * Check if a string is a valid hex color.
   * Only accepts strict #rrggbb format (case-insensitive).
   * @param {*} str - Value to check
   * @returns {boolean}
   */
  function isHex(str) {
    return typeof str === 'string' && /^#[0-9a-fA-F]{6}$/.test(str);
  }

  /**
   * Calculate WCAG relative luminance of a hex color.
   * @param {string} hexColor - Hex color like '#ffffff'
   * @returns {number | null} - Luminance 0..1, or null if invalid
   */
  function luminance(hexColor) {
    const rgb = parseHex(hexColor);
    if (!rgb) return null;

    // Normalize to 0..1
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    // sRGB linearization
    const linearize = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const rLinear = linearize(r);
    const gLinear = linearize(g);
    const bLinear = linearize(b);

    // WCAG formula
    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  }

  /**
   * Calculate contrast ratio between two hex colors.
   * @param {string} hexA - First hex color
   * @param {string} hexB - Second hex color
   * @returns {number | null} - Contrast ratio ≥ 1, or null if either color is invalid
   */
  function contrastRatio(hexA, hexB) {
    const lA = luminance(hexA);
    const lB = luminance(hexB);
    if (lA === null || lB === null) return null;
    const lMax = Math.max(lA, lB);
    const lMin = Math.min(lA, lB);
    return (lMax + 0.05) / (lMin + 0.05);
  }

  const api = { parseHex, toHex, isHex, luminance, contrastRatio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.SL = root.SL || {};
    root.SL.color = api;
  }
})(typeof self !== 'undefined' ? self : this);
