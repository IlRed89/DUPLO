'use strict';

/**
 * Identità prodotto: name duplo, productName/executableName DUPLO.
 * I file dell'app non devono contenere il nome precedente.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const skipDir = new Set(['node_modules', 'dist', '.git']);

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDir.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (!/\.(js|html|css|json|md)$/i.test(entry.name)) continue;
    acc.push(full);
  }
  return acc;
}

test('productName e executableName sono DUPLO', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'duplo');
  assert.equal(pkg.productName, 'DUPLO');
  assert.equal(pkg.build.productName, 'DUPLO');
  assert.equal(pkg.build.executableName, 'DUPLO');
  assert.equal(pkg.build.win.executableName, 'DUPLO');
});

test('main.js imposta app.setName DUPLO e titolo finestra', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.match(main, /app\.setName\(APP_NAME\)/);
  assert.match(main, /const APP_NAME = 'DUPLO'/);
  assert.match(main, /const WINDOW_TITLE = 'DUPLO - Trova File Duplicati'/);
  assert.match(main, /page-title-updated/);
  assert.doesNotMatch(main, /DupFinder/);
});

test('index.html titolo e h1 sono DUPLO', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(html, /<title>DUPLO - Trova File Duplicati<\/title>/);
  assert.match(html, /<h1>DUPLO /);
  assert.doesNotMatch(html, /DupFinder/);
});

test('nessun nome prodotto precedente nei file app (esclusi script overlay)', () => {
  const files = walk(root, []);
  const leftover = [];
  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (rel.startsWith('scripts/') || rel.startsWith('.github/') || rel.endsWith('rebrand.test.js')) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/dupfinder/i.test(text)) leftover.push(rel);
  }
  assert.deepEqual(leftover, []);
});
