const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'store/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,
  {
    // src/lib is a UMD-style library: module.exports in Node, self.SL* in the browser.
    files: ['src/lib/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.node,
      },
    },
  },
  {
    files: ['src/**/*.js'],
    ignores: ['src/lib/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        SL: 'readonly',
      },
    },
  },
  {
    // Playwright fixture: CommonJS helpers whose callbacks run inside the
    // extension page (chrome.*, window.*).
    files: ['tests/e2e/fixtures/**/*.js'],
    rules: {
      'no-empty-pattern': 'off',
    },
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.js', 'eslint.config.js', 'playwright.config.js'],
    ignores: ['tests/e2e/fixtures/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // e2e specs: `page.evaluate(() => ...)` callbacks run inside the extension
    // page, so `chrome`/`window`/the injected `SL` global are in scope there.
    files: ['tests/e2e/**/*.spec.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.webextensions,
        SL: 'readonly',
      },
    },
  },
];
