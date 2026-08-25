const { test, expect, storage } = require('./fixtures/extension');

test.beforeEach(async ({ extPage }) => {
  const page = await extPage('popup/popup.html');
  await storage.clear(page);
});

test('default mode is Dark and is checked on load', async ({ extPage }) => {
  const page = await extPage('popup/popup.html');
  await expect(page.locator('button[data-mode="dark"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('button[data-mode="light"]')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('button[data-mode="system"]')).toHaveAttribute('aria-checked', 'false');
});

test('clicking a mode writes only { mode } and never clobbers themes', async ({ extPage }) => {
  const page = await extPage('popup/popup.html');
  await storage.set(page, {
    settings: {
      v: 2,
      mode: 'dark',
      themes: {
        dark: {
          background: '#1f1f1f',
          text: '#cccccc',
          contrast: 100,
          saturation: 100,
          keepColors: true,
        },
        light: {
          background: '#f5efe0',
          text: '#000000',
          contrast: 100,
          saturation: 100,
          keepColors: true,
        },
      },
    },
  });
  await page.reload();

  await page.locator('button[data-mode="light"]').click();
  await expect(page.locator('button[data-mode="light"]')).toHaveAttribute('aria-checked', 'true');

  const stored = await storage.get(page);
  expect(stored.settings.mode).toBe('light');
  expect(stored.settings.themes.light.background).toBe('#f5efe0');
});

test('gear button opens the options page', async ({ extPage }) => {
  const page = await extPage('popup/popup.html');
  await page.evaluate(() => {
    window.__opened = 0;
    try {
      chrome.runtime.openOptionsPage = () => {
        window.__opened++;
      };
    } catch {
      Object.defineProperty(chrome.runtime, 'openOptionsPage', {
        value: () => {
          window.__opened++;
        },
        configurable: true,
      });
    }
  });

  await page.locator('#open-options').click();

  await expect.poll(() => page.evaluate(() => window.__opened)).toBe(1);
});

test('a failed save surfaces an error and keeps the previous mode checked', async ({ extPage }) => {
  const page = await extPage('popup/popup.html');
  // Confirm dark is the starting checked mode before we break writes.
  await expect(page.locator('button[data-mode="dark"]')).toHaveAttribute('aria-checked', 'true');

  await page.evaluate(() => {
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

  await page.locator('button[data-mode="system"]').click();

  await expect(page.locator('#status')).toContainText('Not saved');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('button[data-mode="dark"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('button[data-mode="system"]')).toHaveAttribute('aria-checked', 'false');
});
