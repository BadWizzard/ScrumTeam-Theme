// Generates Chrome Web Store screenshots (1280x800 PNGs) into store/. Run via
// `npm run screenshots`. See docs/DEVELOPMENT.md ("Scripts" / "Screenshots") for
// why this file lives outside tests/e2e and how it stays out of `npm test`.
//
// store/options.png  — always: the options page with its default theme cards.
// store/site-dark.png — only when E2E_SITE=1 (needs network access to the real
//                        site); test.skip()s otherwise so a plain `npm run
//                        screenshots` still exits green offline.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('../tests/e2e/fixtures/extension');

const STORE_DIR = path.resolve(__dirname, '../store');
const SIZE = { width: 1280, height: 800 };

test.beforeAll(() => {
  fs.mkdirSync(STORE_DIR, { recursive: true });
});

test.describe('store screenshots', () => {
  test.use({ viewport: SIZE });

  test('options page', async ({ extPage }) => {
    const page = await extPage('options/options.html');
    await page.setViewportSize(SIZE);
    await expect(page.locator('section[data-theme="dark"]')).toBeVisible();
    await page.screenshot({ path: path.join(STORE_DIR, 'options.png') });
  });

  test('real site, dark theme', async ({ context, extPage }) => {
    test.skip(process.env.E2E_SITE !== '1', 'set E2E_SITE=1 to shoot the real site');
    await extPage('popup/popup.html'); // ensures the extension's storage defaults exist
    const page = await context.newPage();
    await page.setViewportSize(SIZE);
    try {
      await page.goto('https://teams.scrumlaunch.com/time-tracker', {
        waitUntil: 'load',
        timeout: 30_000,
      });
    } catch (e) {
      test.skip(true, `site unreachable: ${e.message}`);
    }
    await expect(page.locator('html')).toHaveAttribute('data-sl-theme', 'dark');
    await page.waitForTimeout(1000); // let the canvas finish its first paint
    await page.screenshot({ path: path.join(STORE_DIR, 'site-dark.png') });
  });
});
