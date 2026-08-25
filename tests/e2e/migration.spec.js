const { test, expect, storage } = require('./fixtures/extension');

// The options page (Task 8) does not exist yet, so a second popup/popup.html
// page stands in as the watcher: two separate popup pages are two separate
// top-frame contexts, which is what this test needs.
test('legacy { mode } is migrated to v2 exactly once by the top frame', async ({ extPage }) => {
  const watcher = await extPage('popup/popup.html'); // stays open; survives the popup reload
  await storage.clear(watcher);
  await storage.set(watcher, { mode: 'light' });
  await watcher.evaluate(() => {
    window.__slWrites = 0;
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' && ch.settings) window.__slWrites++;
    });
  });

  const popup = await extPage('popup/popup.html');
  await popup.reload();
  // Today's popup.js still uses the legacy chrome.storage.sync.get({ mode })
  // API and does not call SL.store.load() itself (that lands in Task 7), so
  // the migration write-back is triggered explicitly here.
  await popup.evaluate(() => SL.store.load());

  await expect.poll(() => storage.get(watcher)).toMatchObject({ settings: { v: 2, mode: 'light' } });
  const all = await storage.get(watcher);
  expect(all.mode).toBeUndefined();
  expect(all.settings.themes.dark.background).toBe('#1f1f1f');
  expect(await watcher.evaluate(() => window.__slWrites)).toBe(1);
});
