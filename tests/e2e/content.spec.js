// Offline coverage for the content script. The real site is a third party, so
// the host is served from an in-memory fixture via context.route(): Chrome
// still injects the content script because the *URL* matches the manifest's
// `matches` pattern, and the routed response never leaves the machine.
// (page.setContent() would not work here — it leaves the document on
// about:blank, which no content script matches.)
const { test, expect, storage, seed } = require('./fixtures/extension');
const { PNG } = require('pngjs');
const { buildFilter } = require('../../src/lib/filter.js');
const { DEFAULT_THEMES } = require('../../src/lib/defaults.js');

const SITE = 'https://teams.scrumlaunch.com/time-tracker';
const IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><rect width='24' height='24' fill='%23ff9800'/></svg>";

// A solid-color PNG the fixture decodes the way the Flutter engine does — with
// the browser's WebCodecs `ImageDecoder` — and paints into a <canvas>. The
// color sits inside the dark theme's output range, so a pixel that comes out
// unchanged through the page filter proves the pre-correction did its job.
const ORIGINAL = [180, 120, 80];
function solidPng([r, g, b], size = 40) {
  const png = new PNG({ width: size, height: size });
  for (let i = 0; i < size * size; i++) png.data.set([r, g, b, 255], i * 4);
  return PNG.sync.write(png).toString('base64');
}
// Served cross-origin with `Access-Control-Allow-Origin: *`, like the site's S3 bucket.
const ASSET = 'https://assets.test/avatar.png';
const DECODE_SCRIPT = `<script>
window.decodeAndDraw = async () => {
  const bytes = Uint8Array.from(atob('${solidPng(ORIGINAL)}'), (c) => c.charCodeAt(0));
  const dec = new ImageDecoder({ type: 'image/png', data: bytes, premultiplyAlpha: 'premultiply',
    colorSpaceConversion: 'default', preferAnimation: true });
  await dec.tracks.ready; await dec.completed;
  const { image } = await dec.decode({ frameIndex: 0 });
  document.getElementById('decoded').getContext('2d').drawImage(image, 0, 0);
  image.close(); dec.close();
  const plain = document.getElementById('plain').getContext('2d');
  plain.fillStyle = 'rgb(${ORIGINAL.join(',')})'; plain.fillRect(0, 0, 40, 40);
  return true;
};
// The engine's URL codec: a detached CORS <img>, decode(), then the element
// itself is the texture source.
window.decodeViaImg = async () => {
  const img = document.createElement('img');
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = '${ASSET}';
  await img.decode();
  document.getElementById('decoded-img').getContext('2d').drawImage(img, 0, 0);
  return [img.naturalWidth, img.naturalHeight];
};
</script>`;

// <base href="/"> mirrors the real site, which is what makes the same-document
// url(#sl-matrix) reference worth asserting.
const TOP_HTML = `<!doctype html><html lang="en"><head><base href="/"><title>fixture</title></head>
<body><h1>Time tracker</h1><img id="pic" width="24" height="24" alt="" src="${IMG}">
<canvas id="decoded" width="40" height="40"></canvas><canvas id="plain" width="40" height="40"></canvas>
<canvas id="decoded-img" width="40" height="40"></canvas>
<input id="note" type="text">
<iframe id="frame" src="/frame" width="120" height="60"></iframe>${DECODE_SCRIPT}</body></html>`;

// Center pixel of an element, as actually composited (i.e. after <body>'s filter).
async function sample(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const png = await page.screenshot({
    clip: { x: box.x + box.width / 2, y: box.y + box.height / 2, width: 1, height: 1 },
  });
  return [...PNG.sync.read(png).data.slice(0, 3)];
}
const applyMatrix = (m, p) =>
  [0, 1, 2].map((i) =>
    Math.round(
      255 *
        Math.min(
          1,
          Math.max(
            0,
            (m[i * 5] * p[0] + m[i * 5 + 1] * p[1] + m[i * 5 + 2] * p[2]) / 255 + m[i * 5 + 4],
          ),
        ),
    ),
  );
const expectClose = (actual, expected, tol = 3) =>
  expected.forEach((v, i) => expect(Math.abs(actual[i] - v)).toBeLessThanOrEqual(tol));
const navigationType = (page) =>
  page.evaluate(() => performance.getEntriesByType('navigation')[0].type);

const FRAME_HTML = `<!doctype html><html lang="en"><head><base href="/"></head>
<body><p id="in-frame">frame</p></body></html>`;

// A host page on an origin the manifest does NOT match, embedding the site in
// an iframe: the content script then runs *only* in the sub-frame, which is
// what makes the "sub-frames never migrate" test deterministic.
const OUTSIDE = 'https://example.com/host';
const OUTSIDE_HTML = `<!doctype html><html lang="en"><body>
<iframe id="frame" src="https://teams.scrumlaunch.com/frame" width="200" height="120"></iframe>
</body></html>`;

async function routeSite(context) {
  await context.route('https://teams.scrumlaunch.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: route.request().url().endsWith('/frame') ? FRAME_HTML : TOP_HTML,
    }),
  );
  await context.route('https://example.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: OUTSIDE_HTML }),
  );
  await context.route(ASSET, (route) =>
    route.fulfill({
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: Buffer.from(solidPng(ORIGINAL), 'base64'),
    }),
  );
}

test('applies the composed dark matrix, and the inverse to images', async ({ context }) => {
  await routeSite(context);
  const page = await context.newPage();
  await page.goto(SITE);

  await expect(page.locator('html')).toHaveAttribute('data-sl-theme', 'dark');

  const f = buildFilter(DEFAULT_THEMES.dark);
  const svg = page.locator('#sl-theme-svg');
  await expect(svg.locator('#sl-matrix feColorMatrix')).toHaveAttribute(
    'values',
    f.matrix.join(' '),
  );
  await expect(svg.locator('#sl-matrix-inverse feColorMatrix')).toHaveAttribute(
    'values',
    f.inverseMatrix.join(' '),
  );

  expect(await page.evaluate(() => getComputedStyle(document.body).filter)).toContain(
    'url("#sl-matrix")',
  );
  expect(await page.locator('#pic').evaluate((el) => getComputedStyle(el).filter)).toContain(
    'url("#sl-matrix-inverse")',
  );

  // --sl-bg is the *rendered* background, i.e. buildFilter's background.
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--sl-bg')),
  ).toBe(f.background);
});

test('switching to the identity light theme removes the attribute and the properties', async ({
  context,
  openSettled,
}) => {
  await routeSite(context);
  const page = await context.newPage();
  await page.goto(SITE);
  await expect(page.locator('html')).toHaveAttribute('data-sl-theme', 'dark');

  const ctl = await openSettled('popup/popup.html');
  await ctl.evaluate(() => SL.store.save({ mode: 'light' }));

  await expect(page.locator('html')).not.toHaveAttribute('data-sl-theme', /.*/);
  expect(
    await page.evaluate(() =>
      ['--sl-filter', '--sl-filter-inverse', '--sl-bg'].map((p) =>
        document.documentElement.style.getPropertyValue(p),
      ),
    ),
  ).toEqual(['', '', '']);
  // No canvas image was decoded under the old theme, so nothing is stale: no reload.
  await page.waitForTimeout(500);
  expect(await navigationType(page)).toBe('navigate');
});

test('a canvas image decoded via ImageDecoder keeps its original colors under the dark theme', async ({
  context,
}) => {
  await routeSite(context);
  const page = await context.newPage();
  await page.goto(SITE);
  await expect(page.locator('html')).toHaveAttribute('data-sl-theme', 'dark');

  expect(await page.evaluate(() => window.decodeAndDraw())).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-sl-images', '');

  // The plain fill goes through the page filter untouched: proves the filter is live...
  const { matrix } = buildFilter(DEFAULT_THEMES.dark);
  expectClose(await sample(page, '#plain'), applyMatrix(matrix, ORIGINAL));
  // ...while the decoded frame was pre-corrected and comes out as the original color.
  expectClose(await sample(page, '#decoded'), ORIGINAL);
});

test('an image the engine loads by URL through a detached CORS <img> keeps its original colors', async ({
  context,
}) => {
  await routeSite(context);
  const page = await context.newPage();
  await page.goto(SITE);
  await expect(page.locator('html')).toHaveAttribute('data-sl-theme', 'dark');

  expect(await page.evaluate(() => window.decodeViaImg())).toEqual([40, 40]);
  await expect(page.locator('html')).toHaveAttribute('data-sl-images', '');
  expectClose(await sample(page, '#decoded-img'), ORIGINAL);

  // A real DOM <img> is theme.css's business: decode() leaves it untouched.
  expect(
    await page.evaluate(async () => {
      const pic = document.getElementById('pic');
      await pic.decode();
      return pic.src.startsWith('data:image/svg+xml');
    }),
  ).toBe(true);
});

test('a theme switch after canvas images were decoded reloads the page exactly once', async ({
  context,
  openSettled,
}) => {
  await routeSite(context);
  const page = await context.newPage();
  await page.goto(SITE);
  await expect(page.locator('html')).toHaveAttribute('data-sl-theme', 'dark');
  expect(await page.evaluate(() => window.decodeAndDraw())).toBe(true);

  const ctl = await openSettled('popup/popup.html');
  const reloaded = page.waitForEvent('load');
  await ctl.evaluate(() => SL.store.save({ mode: 'light' }));
  await reloaded;

  expect(await navigationType(page)).toBe('reload');
  await expect(page.locator('html')).not.toHaveAttribute('data-sl-theme', /.*/);
  // Fresh document: no image has been decoded under the new theme yet...
  await expect(page.locator('html')).not.toHaveAttribute('data-sl-images', /.*/);
  // ...and the first apply() after the reload must not reload again.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
  expect(await navigationType(page)).toBe('reload');
});

test('the reload is deferred while the user is typing in a text field', async ({
  context,
  openSettled,
}) => {
  await routeSite(context);
  const page = await context.newPage();
  await page.goto(SITE);
  await expect(page.locator('html')).toHaveAttribute('data-sl-theme', 'dark');
  expect(await page.evaluate(() => window.decodeAndDraw())).toBe(true);
  await page.locator('#note').focus();

  const ctl = await openSettled('popup/popup.html');
  await ctl.evaluate(() => SL.store.save({ mode: 'light' }));
  // The theme itself still switches immediately...
  await expect(page.locator('html')).not.toHaveAttribute('data-sl-theme', /.*/);
  // ...but the page is left alone (and the field keeps focus) while it is being edited.
  await page.waitForTimeout(500);
  expect(await navigationType(page)).toBe('navigate');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('note');
  // The other half — the reload firing once the tab is hidden — is not
  // reachable offline: headless Chromium never reports a page as hidden (no
  // CDP lifecycle state or extra tab changes document.visibilityState).
});

test('a top frame and its sub-frame together migrate legacy settings exactly once', async ({
  context,
  openSettled,
}) => {
  await routeSite(context);
  // Opened on an empty profile, so this page's own load() writes nothing and
  // every `settings` change it counts comes from the site's frames.
  const ctl = await openSettled('popup/popup.html');
  await seed(ctl, { mode: 'light' });
  await ctl.evaluate(() => {
    window.__slWrites = 0;
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' && ch.settings) window.__slWrites++;
    });
  });

  const page = await context.newPage();
  await page.goto(SITE);
  // the sub-frame really loaded (and therefore ran its own content script)
  await expect(page.frameLocator('#frame').locator('#in-frame')).toHaveText('frame');
  expect(page.frames().length).toBe(2);

  await expect.poll(() => storage.get(ctl)).toMatchObject({ settings: { v: 2, mode: 'light' } });
  // Give a stray sub-frame write time to show up before asserting there is none.
  await ctl.waitForTimeout(500);
  expect(await ctl.evaluate(() => window.__slWrites)).toBe(1);
  expect((await storage.get(ctl)).mode).toBeUndefined();
});

test('a sub-frame applies the theme but never performs the migration write', async ({
  context,
  openSettled,
}) => {
  await routeSite(context);
  const ctl = await openSettled('popup/popup.html');
  await seed(ctl, { mode: 'dark' });
  await ctl.evaluate(() => {
    window.__slWrites = 0;
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' && ch.settings) window.__slWrites++;
    });
  });

  // The outer page's origin doesn't match the manifest, so the ONLY content
  // script instance here runs in the sub-frame — no top-frame instance can
  // win the race and mask a missing `window === window.top` guard.
  const page = await context.newPage();
  await page.goto(OUTSIDE);
  const frame = page.frameLocator('#frame');
  await expect(frame.locator('#in-frame')).toHaveText('frame');
  // It read the legacy settings and themed itself...
  await expect(frame.locator('html')).toHaveAttribute('data-sl-theme', 'dark');

  // ...but wrote nothing: the legacy value is still exactly as seeded.
  await ctl.waitForTimeout(500);
  expect(await ctl.evaluate(() => window.__slWrites)).toBe(0);
  expect(await storage.get(ctl)).toEqual({ mode: 'dark' });
});
