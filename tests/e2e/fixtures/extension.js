const { test: base, chromium } = require('@playwright/test');
const crypto = require('crypto');
const path = require('path');
const EXT = path.resolve(__dirname, '../../../src');
const extensionId = crypto
  .createHash('sha256')
  .update(EXT)
  .digest('hex')
  .slice(0, 32)
  .replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
exports.test = base.extend({
  context: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await use(ctx);
    await ctx.close();
  },
  extensionId: async ({}, use) => use(extensionId),
  extPage: async ({ context, extensionId }, use) => {
    // helper: open an extension page by relative path
    await use(async (rel) => {
      const p = await context.newPage();
      await p.goto(`chrome-extension://${extensionId}/${rel}`);
      return p;
    });
  },
});
exports.expect = base.expect;
exports.storage = {
  // helpers evaluated inside an extension page
  get: (page) => page.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r))),
  set: (page, v) => page.evaluate((v) => new Promise((r) => chrome.storage.sync.set(v, r)), v),
  clear: (page) => page.evaluate(() => new Promise((r) => chrome.storage.sync.clear(r))),
};
