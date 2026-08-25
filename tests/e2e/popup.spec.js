const {
  test,
  expect,
  storage,
  settled,
  seed,
  installFailingSet,
  restoreRealSet,
} = require('./fixtures/extension');

// No storage reset between tests: the fixture launches a fresh persistent
// context (and therefore an empty chrome.storage.sync) for every test. The
// throwaway-page beforeEach that used to clear storage here was itself the
// source of a flake — its page's own startup write could land after a test
// had already seeded a value.

test('default mode is Dark and is checked on load', async ({ openSettled }) => {
  const page = await openSettled('popup/popup.html');
  await expect(page.locator('button[data-mode="dark"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('button[data-mode="light"]')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('button[data-mode="system"]')).toHaveAttribute('aria-checked', 'false');
});

test('clicking a mode writes only { mode } and never clobbers themes', async ({ openSettled }) => {
  const page = await openSettled('popup/popup.html');
  await seed(page, {
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
  await settled(page);

  await page.locator('button[data-mode="light"]').click();
  await expect(page.locator('button[data-mode="light"]')).toHaveAttribute('aria-checked', 'true');

  const stored = await storage.get(page);
  expect(stored.settings.mode).toBe('light');
  expect(stored.settings.themes.light.background).toBe('#f5efe0');
});

test('gear button opens the options page', async ({ context, openSettled }) => {
  const page = await openSettled('popup/popup.html');

  const [optionsPage] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#open-options').click(),
  ]);
  await optionsPage.waitForLoadState();

  expect(optionsPage.url()).toContain('options/options.html');
});

test('a failed save surfaces an error and keeps the previous mode checked', async ({
  openSettled,
}) => {
  const page = await openSettled('popup/popup.html');
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
  openSettled,
}) => {
  const page = await openSettled('popup/popup.html');
  await expect(page.locator('button[data-mode="dark"]')).toHaveAttribute('aria-checked', 'true');

  // Put a real v2 record in storage first, so the final assertion ("the
  // checked button matches what storage holds") has something to compare
  // against once every subsequent write is made to fail.
  await page.evaluate(() => SL.store.save({ mode: 'dark' }));

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

test('a successful save after a failure clears the error status', async ({ openSettled }) => {
  const page = await openSettled('popup/popup.html');
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
