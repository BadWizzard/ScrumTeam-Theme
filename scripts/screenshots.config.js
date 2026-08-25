// Separate Playwright config for `npm run screenshots`, used via
// `playwright test --config=scripts/screenshots.config.js`.
//
// The default playwright.config.js pins `testDir: 'tests/e2e'`, so an explicit
// `playwright test scripts/screenshots.spec.js` under that config is refused
// (Playwright only resolves test files inside testDir). Rather than widen the
// default testDir — which would risk scripts/screenshots.spec.js being picked
// up by a bare `npx playwright test` / `npm run test:e2e` / `npm test` — this
// config points testDir at scripts/ instead, so the two suites stay fully
// separate. See docs/DEVELOPMENT.md ("Scripts" / "Screenshots").
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: 'screenshots.spec.js',
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
});
