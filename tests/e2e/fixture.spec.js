const { test, expect, storage } = require('./fixtures/extension');

test('popup shows the three mode buttons', async ({ openSettled }) => {
  const page = await openSettled('popup/popup.html');
  const buttons = page.locator('.modes button[data-mode]');
  await expect(buttons).toHaveCount(3);
  await expect(page.locator('button[data-mode="dark"]')).toBeVisible();
  await expect(page.locator('button[data-mode="light"]')).toBeVisible();
  await expect(page.locator('button[data-mode="system"]')).toBeVisible();
});

test('clicking Light does not throw and persists mode to chrome.storage.sync', async ({
  openSettled,
}) => {
  const page = await openSettled('popup/popup.html');
  const errors = [];
  page.on('pageerror', (err) => errors.push(err));

  await page.locator('button[data-mode="light"]').click();
  await expect(page.locator('button[data-mode="light"]')).toHaveAttribute('aria-checked', 'true');

  expect(errors).toEqual([]);

  const stored = await storage.get(page);
  expect(stored.settings.mode).toBe('light');
  expect(stored.mode).toBeUndefined();
});
