const { test, expect } = require('./fixtures/extension');

test('popup shows the three mode buttons', async ({ extPage }) => {
  const page = await extPage('popup/popup.html');
  const buttons = page.locator('.modes button[data-mode]');
  await expect(buttons).toHaveCount(3);
  await expect(page.locator('button[data-mode="dark"]')).toBeVisible();
  await expect(page.locator('button[data-mode="light"]')).toBeVisible();
  await expect(page.locator('button[data-mode="system"]')).toBeVisible();
});
