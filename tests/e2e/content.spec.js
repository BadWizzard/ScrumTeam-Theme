// Offline coverage for the content script. The real site is a third party, so
// the host is served from an in-memory fixture via context.route(): Chrome
// still injects the content script because the *URL* matches the manifest's
// `matches` pattern, and the routed response never leaves the machine.
// (page.setContent() would not work here — it leaves the document on
// about:blank, which no content script matches.)
const { test, expect, storage, seed } = require('./fixtures/extension');
const { buildFilter } = require('../../src/lib/filter.js');
const { DEFAULT_THEMES } = require('../../src/lib/defaults.js');

const SITE = 'https://teams.scrumlaunch.com/time-tracker';
const IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><rect width='24' height='24' fill='%23ff9800'/></svg>";

// <base href="/"> mirrors the real site, which is what makes the same-document
// url(#sl-matrix) reference worth asserting.
const TOP_HTML = `<!doctype html><html lang="en"><head><base href="/"><title>fixture</title></head>
<body><h1>Time tracker</h1><img id="pic" width="24" height="24" alt="" src="${IMG}">
<iframe id="frame" src="/frame" width="120" height="60"></iframe></body></html>`;

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
