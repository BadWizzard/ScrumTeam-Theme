const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '../../src/manifest.json');
const messagesPath = path.join(__dirname, '../../src/_locales/en/messages.json');

const manifestText = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestText);

const messagesText = fs.readFileSync(messagesPath, 'utf8');
const messages = JSON.parse(messagesText);

test('manifest parses as valid JSON', () => {
  assert.ok(manifest);
});

test('manifest_version equals 3', () => {
  assert.equal(manifest.manifest_version, 3);
});

test('permissions deep-equals ["storage"]', () => {
  assert.deepEqual(manifest.permissions, ['storage']);
});

test('no host_permissions, background, or web_accessible_resources', () => {
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('default_locale equals "en"', () => {
  assert.equal(manifest.default_locale, 'en');
});

test('messages file parses as valid JSON', () => {
  assert.ok(messages);
});

test('extDescription message length <= 132', () => {
  assert.ok(messages.extDescription, 'extDescription key exists');
  assert.ok(messages.extDescription.message, 'extDescription.message exists');
  assert.ok(
    messages.extDescription.message.length <= 132,
    `length ${messages.extDescription.message.length} <= 132`,
  );
});

test('every __MSG_x__ in manifest exists in messages', () => {
  const msgPattern = /__MSG_(\w+)__/g;
  const found = new Set();
  let match;
  const manifestStr = JSON.stringify(manifest);
  while ((match = msgPattern.exec(manifestStr)) !== null) {
    found.add(match[1]);
  }
  for (const key of found) {
    assert.ok(messages[key], `messages.${key} exists`);
  }
});

test('content_scripts[0].matches deep-equals ["*://teams.scrumlaunch.com/*"]', () => {
  assert.ok(manifest.content_scripts, 'content_scripts exists');
  assert.ok(manifest.content_scripts[0], 'content_scripts[0] exists');
  assert.deepEqual(manifest.content_scripts[0].matches, ['*://teams.scrumlaunch.com/*']);
});

test('minimum_chrome_version equals "111"', () => {
  assert.equal(manifest.minimum_chrome_version, '111');
});

test('every icon path in icons exists on disk', () => {
  for (const [size, filepath] of Object.entries(manifest.icons)) {
    const fullPath = path.join(__dirname, '../../src', filepath);
    assert.ok(fs.existsSync(fullPath), `icon ${filepath} exists (size ${size})`);
  }
});

test('every icon path in action.default_icon exists on disk', () => {
  for (const [size, filepath] of Object.entries(manifest.action.default_icon)) {
    const fullPath = path.join(__dirname, '../../src', filepath);
    assert.ok(fs.existsSync(fullPath), `action icon ${filepath} exists (size ${size})`);
  }
});

test('version equals "2.0.0"', () => {
  assert.equal(manifest.version, '2.0.0');
});

test('options_ui points at the options page and opens in a tab', () => {
  assert.equal(manifest.options_ui.page, 'options/options.html');
  assert.equal(manifest.options_ui.open_in_tab, true);
});

test('content script runs at document_start in all frames', () => {
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  assert.equal(manifest.content_scripts[0].all_frames, true);
});

// The libraries are plain classic scripts that populate self.SL in order, so a
// reordering here breaks the extension at runtime with no other symptom.
test('content script js array is exactly the documented load order', () => {
  assert.deepEqual(manifest.content_scripts[0].js, [
    'lib/color.js',
    'lib/defaults.js',
    'lib/settings.js',
    'lib/theme-logic.js',
    'lib/filter.js',
    'lib/settings-store.js',
    'content/content.js',
  ]);
});

// The repository is private, so a homepage_url pointing at it 404s for every
// store visitor. Re-add it only once a public URL exists (see docs/STORE_LISTING.md).
test('homepage_url is either absent or a public https URL', () => {
  if (manifest.homepage_url !== undefined) {
    assert.match(manifest.homepage_url, /^https:\/\//);
    assert.doesNotMatch(manifest.homepage_url, /github\.com\/BadWizzard\/ScrumTeam-Theme/);
  }
});

test('every js/css file listed in any content script exists on disk', () => {
  for (const cs of manifest.content_scripts) {
    for (const rel of (cs.js || []).concat(cs.css || [])) {
      assert.ok(fs.existsSync(path.join(__dirname, '../../src', rel)), `${rel} exists`);
    }
  }
});

// content/page.js must run in the page's own JS world: it wraps the page's
// `ImageDecoder`, which an isolated-world script cannot reach. `world` needs
// Chrome 111 — the same floor color-mix() already imposes.
test('content_scripts[1] is content/page.js in the MAIN world, same matches, document_start, all frames', () => {
  const cs = manifest.content_scripts[1];
  assert.ok(cs, 'content_scripts[1] exists');
  assert.deepEqual(cs.matches, manifest.content_scripts[0].matches);
  assert.deepEqual(cs.js, ['content/page.js']);
  assert.equal(cs.css, undefined);
  assert.equal(cs.world, 'MAIN');
  assert.equal(cs.run_at, 'document_start');
  assert.equal(cs.all_frames, true);
});

test('the isolated-world content script never declares a world', () => {
  assert.equal(manifest.content_scripts[0].world, undefined);
  assert.equal(manifest.content_scripts.length, 2);
});
