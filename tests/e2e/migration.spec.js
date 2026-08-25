const { test, expect, storage, seed } = require('./fixtures/extension');

test('legacy { mode } is migrated to v2 exactly once by the top frame', async ({ openSettled }) => {
  // The watcher is a popup page opened on an empty profile: load() finds
  // nothing to migrate and therefore writes nothing, so every `settings`
  // change it observes from here on belongs to the page opened below.
  const watcher = await openSettled('popup/popup.html');
  await seed(watcher, { mode: 'light' });
  await watcher.evaluate(() => {
    window.__slWrites = 0;
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' && ch.settings) window.__slWrites++;
    });
  });

  // options.js calls SL.store.load() on script start, so simply opening the
  // options page triggers the migration write-back (no need to reload or
  // drive it explicitly).
  await openSettled('options/options.html');

  await expect
    .poll(() => storage.get(watcher))
    .toMatchObject({ settings: { v: 2, mode: 'light' } });
  const all = await storage.get(watcher);
  expect(all.mode).toBeUndefined();
  expect(all.settings.themes.dark.background).toBe('#1f1f1f');
  expect(await watcher.evaluate(() => window.__slWrites)).toBe(1);

  // Once the data is v2, further page loads must not write again (their
  // load() has fully settled by the time openSettled resolves).
  await openSettled('popup/popup.html');
  await openSettled('options/options.html');
  expect(await watcher.evaluate(() => window.__slWrites)).toBe(1);
});
