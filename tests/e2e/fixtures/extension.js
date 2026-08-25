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

const storage = {
  // helpers evaluated inside an extension page
  get: (page) => page.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r))),
  set: (page, v) => page.evaluate((v) => new Promise((r) => chrome.storage.sync.set(v, r)), v),
  clear: (page) => page.evaluate(() => new Promise((r) => chrome.storage.sync.clear(r))),
};

/**
 * Resolves once an extension page's initial `SL.store.load()` has settled.
 * popup.js and options.js set `window.__slReady` in both the `.then` and the
 * `.catch` of that load, and that flag is the only reliable settle signal: on
 * a profile with nothing stored, `load()` performs no write at all (see
 * settings-store.js), so waiting for a storage write would hang forever.
 */
const settled = (page) => page.waitForFunction(() => window.__slReady === true);

/**
 * `storage.set` followed by a confirmed read-back, so a spec never proceeds
 * on a write that readers cannot see yet.
 */
async function seed(page, value) {
  await storage.set(page, value);
  await base.expect.poll(() => storage.get(page)).toMatchObject(value);
}

/**
 * Installs a `chrome.storage.sync.set` stub that always fails with
 * `chrome.runtime.lastError = { message: 'QUOTA' }`, so `SL.store.save()`
 * rejects. Stashes the real implementation on `window` so `restoreRealSet`
 * can put it back. Three tiers of fallback because `chrome.storage.sync.set`
 * is read-only in some Chrome builds.
 */
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
  // helper: open an extension page and wait for its initial load() to settle
  openSettled: async ({ extPage }, use) => {
    await use(async (rel) => {
      const p = await extPage(rel);
      await settled(p);
      return p;
    });
  },
});
exports.expect = base.expect;
exports.storage = storage;
exports.settled = settled;
exports.seed = seed;
exports.installFailingSet = installFailingSet;
exports.restoreRealSet = restoreRealSet;
