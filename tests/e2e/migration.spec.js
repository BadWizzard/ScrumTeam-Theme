const { test, expect, storage } = require('./fixtures/extension');

test('legacy { mode } is migrated to v2 exactly once by the top frame', async ({ extPage }) => {
  const watcher = await extPage('options/options.html'); // stays open; survives the popup reload
  // options.js on this page also calls SL.store.load() on open, which performs
  // its own migration write against whatever storage state existed when this
  // page opened. Wait for that to settle before resetting storage below, or
  // it can race with storage.clear/storage.set and clobber the seeded value.
  await expect.poll(() => storage.get(watcher)).toMatchObject({ settings: { v: 2 } });
  await storage.clear(watcher);
  await storage.set(watcher, { mode: 'light' });
  await watcher.evaluate(() => {
    window.__slWrites = 0;
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' && ch.settings) window.__slWrites++;
    });
  });

  // popup.js calls SL.store.load() on script start, so simply opening the
  // popup page triggers the migration write-back (no need to reload or
  // drive it explicitly).
  await extPage('popup/popup.html');

  await expect.poll(() => storage.get(watcher)).toMatchObject({ settings: { v: 2, mode: 'light' } });
  const all = await storage.get(watcher);
  expect(all.mode).toBeUndefined();
  expect(all.settings.themes.dark.background).toBe('#1f1f1f');
  expect(await watcher.evaluate(() => window.__slWrites)).toBe(1);
});
