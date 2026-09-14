/**
 * @file scanner.test.js
 * @description Suite di test unitari per validare il motore di scansione e hashing di DupFinder.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { computePartialHash, computeFullHash } = require('./hasher');
const { findDuplicates, ScanCancellationToken } = require('./scanner');

test('Hasher: calcolo corretto di partial hash e full hash su file identici', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dupfinder-test-'));
  const file1 = path.join(tmpDir, 'test1.txt');
  const file2 = path.join(tmpDir, 'test2.txt');
  const file3 = path.join(tmpDir, 'test3.txt');

  const contentIdentical = 'Contenuto identico per il test di calcolo hash di DupFinder! '.repeat(200);
  const contentDifferent = 'Contenuto completamente diverso e univoco.';

  await fsp.writeFile(file1, contentIdentical);
  await fsp.writeFile(file2, contentIdentical);
  await fsp.writeFile(file3, contentDifferent);

  const hash1 = await computeFullHash(file1, 'sha256');
  const hash2 = await computeFullHash(file2, 'sha256');
  const hash3 = await computeFullHash(file3, 'sha256');

  assert.equal(hash1, hash2, 'I file con lo stesso contenuto devono produrre lo stesso hash SHA-256');
  assert.notEqual(hash1, hash3, 'I file con contenuto diverso devono produrre hash differenti');

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Scanner: identificazione corretta di duplicati con filtri multipli e criteri hash a due step', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dupfinder-scan-'));
  const subDir = path.join(tmpDir, 'subfolder');
  await fsp.mkdir(subDir, { recursive: true });

  const fileA = path.join(tmpDir, 'fileA.txt');
  const fileB = path.join(subDir, 'fileB.txt');
  const fileC = path.join(tmpDir, 'unique.txt');

  const duplicateContent = 'Stringa di duplicazione per la scansione automatizzata ricorsiva. '.repeat(100);
  await fsp.writeFile(fileA, duplicateContent);
  await fsp.writeFile(fileB, duplicateContent);
  await fsp.writeFile(fileC, 'Testo unico');

  const criteria = {
    matchName: false,
    matchSize: true,
    matchDate: false,
    matchHash: true,
    matchExtension: true,
    hashAlgorithm: 'sha256',
    minSizeBytes: 0,
    maxSizeBytes: 0,
    includeExtensions: [],
    excludeExtensions: [],
    includeHidden: false
  };

  const token = new ScanCancellationToken();
  const groups = await findDuplicates([tmpDir], criteria, token, () => {});

  assert.equal(groups.length, 1, 'Deve essere individuato esattamente 1 gruppo di duplicati');
  assert.equal(groups[0].files.length, 2, 'Il gruppo duplicato deve contenere esattamente 2 file');
  assert.equal(groups[0].wastedBytes, groups[0].size, 'Lo spazio sprecato calcolato deve corrispondere alla dimensione del duplicato');

  await fsp.rm(tmpDir, { recursive: true, force: true });
});
