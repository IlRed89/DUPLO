/**
 * @file everythingScanner.test.js
 * @description Test per l'integrazione di Everything e fallback.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const {
  getEsBinaryPath,
  getEverythingEnginePath,
  isEverythingRunning,
  walkWithEverything
} = require('./everythingScanner');

test('getEsBinaryPath restituisce il binario se siamo su win32 o null', () => {
  const p = getEsBinaryPath();
  if (process.platform === 'win32') {
    assert.ok(p, 'Su Windows deve trovare es.exe');
    assert.ok(fs.existsSync(p), 'Il file es.exe deve esistere');
  } else {
    assert.equal(p, null);
  }
});

test('getEverythingEnginePath restituisce il binario portatile se siamo su win32 o null', () => {
  const p = getEverythingEnginePath();
  if (process.platform === 'win32') {
    assert.ok(p, 'Su Windows deve trovare Everything.exe portatile');
    assert.ok(fs.existsSync(p), 'Il file Everything.exe deve esistere');
  } else {
    assert.equal(p, null);
  }
});

test('isEverythingRunning non lancia eccezioni e risponde con boolean', async () => {
  const isRunning = await isEverythingRunning();
  assert.equal(typeof isRunning, 'boolean');
});

test('walkWithEverything fallisce in modo pulito con fallback se Everything non risponde', async () => {
  const files = [];
  const skipStats = { tooSmall: 0, tooLarge: 0, wrongExt: 0, tooOld: 0, tooNew: 0 };
  const ok = await walkWithEverything(__dirname, {}, null, null, files, skipStats);
  assert.equal(typeof ok, 'boolean');
});

