// Real-site smoke test: verifies the composed SVG color-matrix filter is actually
// applied to teams.scrumlaunch.com (a Flutter/CanvasKit app, so the check is pixel
// sampling from the canvas rather than DOM assertions). Requires network access and
// is opt-in via E2E_SITE=1 so `npm run test:e2e` stays offline-green.
const { test, expect, storage } = require('./fixtures/extension');
const F = require('../../src/lib/filter.js');
test.skip(process.env.E2E_SITE !== '1', 'set E2E_SITE=1 to run the real-site smoke');
test('applies the composed matrix to the real site', async ({ context, extPage }) => {
  const ctl = await extPage('popup/popup.html');
  const page = await context.newPage();
  try {
    await page.goto('https://teams.scrumlaunch.com/time-tracker', {
      waitUntil: 'load',
      timeout: 30_000,
    });
  } catch (e) {
    test.skip(true, `site unreachable: ${e.message}`);
  }
  await expect(page.locator('html')).toHaveAttribute('data-sl-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).filter)).toContain(
    'url("#sl-matrix")',
  );
  const sample = async () => {
    const box = await page.locator('canvas').first().boundingBox();
    const png = await page.screenshot({
      clip: { x: box.x + 8, y: box.y + 8, width: 1, height: 1 },
    });
    return require('pngjs').PNG.sync.read(png).data.slice(0, 3);
  };
  await expect
    .poll(
      async () => {
        const [r, g, b] = await sample();
        return r === 255 && g === 255 && b === 255;
      },
      { timeout: 20_000 },
    )
    .toBe(false);
  const p1 = await sample();
  await ctl.evaluate(() => SL.store.save({ mode: 'light' }));
  await expect(page.locator('html')).not.toHaveAttribute('data-sl-theme', /./);
  const p0 = await sample();
  const { matrix } = F.buildFilter((await storage.get(ctl)).settings.themes.dark);
  const expected = [0, 1, 2].map((i) =>
    Math.round(
      255 *
        Math.min(
          1,
          Math.max(
            0,
            (matrix[i * 5] * p0[0]) / 255 +
              (matrix[i * 5 + 1] * p0[1]) / 255 +
              (matrix[i * 5 + 2] * p0[2]) / 255 +
              matrix[i * 5 + 4],
          ),
        ),
    ),
  );
  expected.forEach((v, i) => expect(Math.abs(v - p1[i])).toBeLessThanOrEqual(12));
});
