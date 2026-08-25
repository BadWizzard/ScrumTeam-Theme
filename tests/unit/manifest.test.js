const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');

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
  assert.ok(messages.extDescription.message.length <= 132, `length ${messages.extDescription.message.length} <= 132`);
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
