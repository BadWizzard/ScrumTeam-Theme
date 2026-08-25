const { test, expect, storage } = require('./fixtures/extension');
const { buildFilter } = require('../../src/lib/filter.js');
const { DEFAULT_THEMES } = require('../../src/lib/defaults.js');

test.beforeEach(async ({ extPage }) => {
  const page = await extPage('options/options.html');
  await storage.clear(page);
});

// Installs a chrome.storage.sync.set stub that always fails with
// chrome.runtime.lastError = { message: 'QUOTA' }, so SL.store.save()
// rejects. Mirrors tests/e2e/popup.spec.js's installFailingSet.
async function installFailingSet(page) {
  await page.evaluate(() => {
    window.__slRealSet = window.__slRealSet || chrome.storage.sync.set.bind(chrome.storage.sync);
    const stub = (items, cb) => {
      Object.defineProperty(chrome.runtime, 'lastError', {
        value: { message: 'QUOTA' },
        configurable: true,
      });
      cb();
      delete chrome.runtime.lastError;
    };
    try {
      chrome.storage.sync.set = stub;
    } catch {
      try {
        Object.defineProperty(chrome.storage.sync, 'set', { value: stub, configurable: true });
      } catch {
        const real = chrome.storage.sync;
        const proxy = new Proxy(real, { get: (t, k) => (k === 'set' ? stub : t[k]) });
        Object.defineProperty(chrome.storage, 'sync', { value: proxy, configurable: true });
      }
    }
  });
}

function darkBgHex(page) {
  return page.locator('section[data-theme="dark"] input[type="text"][data-field="background"]');
}
function darkTextHex(page) {
  return page.locator('section[data-theme="dark"] input[type="text"][data-field="text"]');
}
function lightBgHex(page) {
  return page.locator('section[data-theme="light"] input[type="text"][data-field="background"]');
}

test('renders the default dark and light themes on load', async ({ extPage }) => {
  const page = await extPage('options/options.html');

  await expect(darkBgHex(page)).toHaveValue(DEFAULT_THEMES.dark.background);
  await expect(darkTextHex(page)).toHaveValue(DEFAULT_THEMES.dark.text);
  await expect(lightBgHex(page)).toHaveValue(DEFAULT_THEMES.light.background);
  await expect(
    page.locator('section[data-theme="light"] input[type="text"][data-field="text"]')
  ).toHaveValue(DEFAULT_THEMES.light.text);
});

test('editing the dark background writes only themes.dark and updates the preview matrix', async ({
  extPage,
}) => {
  const page = await extPage('options/options.html');
  await storage.set(page, {
    settings: {
      v: 2,
      mode: 'system',
      themes: {
        dark: DEFAULT_THEMES.dark,
        light: { ...DEFAULT_THEMES.light, background: '#f5efe0' },
      },
    },
  });
  await page.reload();

  await darkBgHex(page).fill('#101820');

  await expect
    .poll(async () => (await storage.get(page)).settings.themes.dark.background)
    .toBe('#101820');

  const stored = await storage.get(page);
  expect(stored.settings.themes.light.background).toBe('#f5efe0');
  expect(stored.settings.mode).toBe('system');

  const expectedValues = buildFilter(
    { ...DEFAULT_THEMES.dark, background: '#101820' },
    'sl-matrix-dark'
  ).matrix.join(' ');
  await expect(page.locator('#sl-matrix-dark feColorMatrix')).toHaveAttribute(
    'values',
    expectedValues
  );

  const previewFilter = await page
    .locator('section[data-theme="dark"] .preview')
    .evaluate((el) => el.style.filter);
  expect(previewFilter).toContain('url("#sl-matrix-dark")');
});

test('per-theme reset restores that theme only', async ({ extPage }) => {
  const page = await extPage('options/options.html');
  await storage.set(page, {
    settings: {
      v: 2,
      mode: 'system',
      themes: {
        dark: { ...DEFAULT_THEMES.dark, background: '#101820' },
        light: { ...DEFAULT_THEMES.light, background: '#f5efe0' },
      },
    },
  });
  await page.reload();

  await page.locator('section[data-theme="dark"] button.reset-theme').click();

  await expect
    .poll(async () => (await storage.get(page)).settings.themes.dark.background)
    .toBe(DEFAULT_THEMES.dark.background);

  const stored = await storage.get(page);
  expect(stored.settings.themes.light.background).toBe('#f5efe0');
  await expect(darkBgHex(page)).toHaveValue(DEFAULT_THEMES.dark.background);
});

test('reset all restores mode dark and both themes to defaults', async ({ extPage }) => {
  const page = await extPage('options/options.html');
  await storage.set(page, {
    settings: {
      v: 2,
      mode: 'light',
      themes: {
        dark: { ...DEFAULT_THEMES.dark, background: '#101820' },
        light: { ...DEFAULT_THEMES.light, background: '#f5efe0' },
      },
    },
  });
  await page.reload();

  await page.locator('#reset-all').click();

  await expect
    .poll(async () => (await storage.get(page)).settings.mode)
    .toBe('dark');

  const stored = await storage.get(page);
  expect(stored.settings.themes.dark).toEqual(DEFAULT_THEMES.dark);
  expect(stored.settings.themes.light).toEqual(DEFAULT_THEMES.light);
  await expect(darkBgHex(page)).toHaveValue(DEFAULT_THEMES.dark.background);
  await expect(lightBgHex(page)).toHaveValue(DEFAULT_THEMES.light.background);
});

test('invalid hex marks the field invalid and does not save', async ({ extPage }) => {
  const page = await extPage('options/options.html');
  await expect.poll(() => storage.get(page)).toMatchObject({ settings: { v: 2 } });

  await darkBgHex(page).fill('#fff');
  await expect(darkBgHex(page)).toHaveAttribute('aria-invalid', 'true');

  await darkBgHex(page).fill('zzz');
  await expect(darkBgHex(page)).toHaveAttribute('aria-invalid', 'true');

  await page.waitForTimeout(500);

  const stored = await storage.get(page);
  expect(stored.settings.themes.dark.background).toBe(DEFAULT_THEMES.dark.background);
});

test('a stubbed storage failure surfaces a Not saved status', async ({ extPage }) => {
  const page = await extPage('options/options.html');
  await expect.poll(() => storage.get(page)).toMatchObject({ settings: { v: 2 } });

  await installFailingSet(page);

  await darkBgHex(page).fill('#101820');

  await expect(page.locator('#status')).toContainText('Not saved', { timeout: 2000 });
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');
});

test('a low-contrast dark theme shows the readability hint', async ({ extPage }) => {
  const page = await extPage('options/options.html');

  await darkTextHex(page).fill('#2a2a2a');

  await expect(page.locator('section[data-theme="dark"] p.hint')).toContainText('Low contrast', {
    timeout: 1000,
  });
});
