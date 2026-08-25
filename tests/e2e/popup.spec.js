const { test, expect, storage } = require('./fixtures/extension');

test.beforeEach(async ({ extPage }) => {
  const page = await extPage('popup/popup.html');
  await storage.clear(page);
});

// Installs a chrome.storage.sync.set stub that always fails with
// chrome.runtime.lastError = { message: 'QUOTA' }, so SL.store.save()
// rejects. Stashes the real implementation on window so restoreRealSet can
// put it back.
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

async function restoreRealSet(page) {
  await page.evaluate(() => {
    chrome.storage.sync.set = window.__slRealSet;
  });
}

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

  await installFailingSet(page);

  await page.locator('button[data-mode="system"]').click();

  await expect(page.locator('#status')).toContainText('Not saved');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('button[data-mode="dark"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('button[data-mode="system"]')).toHaveAttribute('aria-checked', 'false');
});

test('rapid clicks while saves are failing settle on one consistent mode, not a third value', async ({
  extPage,
}) => {
  const page = await extPage('popup/popup.html');
  await expect(page.locator('button[data-mode="dark"]')).toHaveAttribute('aria-checked', 'true');

  await installFailingSet(page);

  // Fire both clicks without awaiting the first before issuing the second.
  // The in-flight-save guard (buttons disabled while a save is pending)
  // serializes the two underlying saves; without it the UI could revert to
  // a stale pre-both-clicks snapshot that matches neither click.
  const clickLight = page.locator('button[data-mode="light"]').click();
  const clickSystem = page.locator('button[data-mode="system"]').click();
  await clickLight;
  await clickSystem;

  await expect(page.locator('#status')).toContainText('Not saved');

  const stored = await storage.get(page);
  const checked = page.locator('.modes button[aria-checked="true"]');
  await expect(checked).toHaveCount(1);
  await expect(checked).toHaveAttribute('data-mode', stored.settings.mode);
});

test('a successful save after a failure clears the error status', async ({ extPage }) => {
  const page = await extPage('popup/popup.html');
  await installFailingSet(page);

  await page.locator('button[data-mode="light"]').click();
  await expect(page.locator('#status')).toContainText('Not saved');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');

  await restoreRealSet(page);

  await page.locator('button[data-mode="light"]').click();
  await expect(page.locator('button[data-mode="light"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#status')).toHaveText('');
  await expect(page.locator('#status')).not.toHaveAttribute('data-state', 'error');

  const stored = await storage.get(page);
  expect(stored.settings.mode).toBe('light');
});
