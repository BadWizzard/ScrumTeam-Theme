const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '../..');
const scriptPath = path.join(repoRoot, 'scripts/package.sh');
const manifestPath = path.join(repoRoot, 'src/manifest.json');
const version = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version;
const zipPath = path.join(repoRoot, `dist/dark-modern-for-scrumlaunch-teams-${version}.zip`);

test('scripts/package.sh is executable', () => {
  assert.ok(fs.existsSync(scriptPath), 'scripts/package.sh exists');
  const mode = fs.statSync(scriptPath).mode;
  assert.ok(mode & 0o111, 'scripts/package.sh has an execute bit set');
});

test('scripts/package.sh produces a zip with manifest.json at its root and no dev files', () => {
  execFileSync(scriptPath, { cwd: repoRoot, stdio: 'pipe' });
  assert.ok(fs.existsSync(zipPath), `${zipPath} was created`);

  const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });

  assert.match(listing, /(^|\s)manifest\.json\s*$/m, 'manifest.json is listed at the zip root');
  assert.doesNotMatch(listing, /node_modules\//, 'no node_modules/ in the zip');
  assert.doesNotMatch(listing, /(^|\/)tests\//, 'no tests/ in the zip');
  assert.doesNotMatch(listing, /(^|\/)docs\//, 'no docs/ in the zip');
});
