/**
 * @file packageHygiene.test.js
 * @description Fase 8.0: niente FFmpeg, dipendenze runtime minime, icona .ico presente.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package.json non dichiara ffmpeg / ffprobe / fluent-ffmpeg', () => {
  const blob = JSON.stringify(pkg);
  assert.doesNotMatch(blob, /ffmpeg/i);
  assert.doesNotMatch(blob, /ffprobe/i);
  assert.doesNotMatch(blob, /fluent-ffmpeg/i);
});

test('electron ed electron-builder stanno in devDependencies', () => {
  assert.ok(pkg.devDependencies.electron);
  assert.ok(pkg.devDependencies['electron-builder']);
  assert.equal(pkg.dependencies.electron, undefined);
  assert.equal(pkg.dependencies['electron-builder'], undefined);
  assert.ok(pkg.dependencies['electron-log'], 'unico runtime atteso: electron-log');
});

test('win.icon punta a build/icon.ico e il file esiste', () => {
  assert.equal(pkg.build.win.icon, 'build/icon.ico');
  const ico = path.join(root, 'build', 'icon.ico');
  assert.ok(fs.existsSync(ico), 'Metti fisicamente build/icon.ico prima della build Windows');
  assert.ok(fs.statSync(ico).size > 1000, 'icon.ico non deve essere un placeholder vuoto');
});

test('hasher.js usa solo crypto nativo', () => {
  const hasher = fs.readFileSync(path.join(root, 'src', 'hasher.js'), 'utf8');
  assert.match(hasher, /require\('crypto'\)/);
  assert.doesNotMatch(hasher, /ffmpeg/i);
});
