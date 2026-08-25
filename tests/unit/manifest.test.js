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

test('every js file listed in the content script exists on disk', () => {
  for (const rel of manifest.content_scripts[0].js.concat(manifest.content_scripts[0].css)) {
    assert.ok(fs.existsSync(path.join(__dirname, '../../src', rel)), `${rel} exists`);
  }
});
