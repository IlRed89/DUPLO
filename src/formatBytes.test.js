/**
 * @file formatBytes.test.js
 * @description Verifica l'utility condivisa Main/Renderer.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatBytes } = require('./formatBytes');

test('formatBytes: zero, negativi e non-finiti → 0 B', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(-10), '0 B');
  assert.equal(formatBytes(Number.NaN), '0 B');
  assert.equal(formatBytes(undefined), '0 B');
});

test('formatBytes: scale 1024', () => {
  assert.equal(formatBytes(1024), '1.00 KB');
  assert.equal(formatBytes(1048576), '1.00 MB');
});
