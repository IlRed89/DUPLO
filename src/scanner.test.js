/**
 * @file scanner.test.js
 * @description Suite di test unitari per validare il motore di scansione e hashing di DUPLO.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { computePartialHash, computeFullHash } = require('./hasher');
const { findDuplicates, ScanCancellationToken, classifyMatchReason } = require('./scanner');
const { getCategoryExtensions } = require('./fileCategories');

test('Hasher: calcolo corretto di partial hash e full hash su file identici', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-test-'));
  const file1 = path.join(tmpDir, 'test1.txt');
  const file2 = path.join(tmpDir, 'test2.txt');
  const file3 = path.join(tmpDir, 'test3.txt');

  const contentIdentical = 'Contenuto identico per il test di calcolo hash di DUPLO! '.repeat(200);
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
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-scan-'));
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
  assert.equal(groups[0].matchReason, 'hash', 'Con hashing attivo il criterio è hash');

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Scanner: la categoria Documenti include solo le estensioni hardcoded', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-cat-'));
  const same = 'stesso contenuto per filtro categoria. '.repeat(40);
  await fsp.writeFile(path.join(tmpDir, 'a.txt'), same);
  await fsp.writeFile(path.join(tmpDir, 'b.txt'), same);
  await fsp.writeFile(path.join(tmpDir, 'c.jpg'), same);

  const criteria = {
    matchName: false,
    matchSize: true,
    matchDate: false,
    matchHash: true,
    matchExtension: false,
    hashAlgorithm: 'sha256',
    minSizeBytes: 0,
    maxSizeBytes: 0,
    includeExtensions: getCategoryExtensions('documents'),
    excludeExtensions: [],
    includeHidden: false
  };

  const groups = await findDuplicates([tmpDir], criteria, new ScanCancellationToken(), () => {});
  assert.equal(groups.length, 1);
  assert.equal(groups[0].files.length, 2);
  assert.ok(groups[0].files.every((f) => f.path.endsWith('.txt')));

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Scanner: formato esatto e range dimensione scartano i file fuori filtro', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-adv-'));
  const same = 'payload identico per filtri avanzati. '.repeat(80);
  await fsp.writeFile(path.join(tmpDir, 'keep-a.csv'), same);
  await fsp.writeFile(path.join(tmpDir, 'keep-b.csv'), same);
  await fsp.writeFile(path.join(tmpDir, 'ignore.txt'), same);
  await fsp.writeFile(path.join(tmpDir, 'tiny.csv'), 'x');

  const criteria = {
    matchName: false,
    matchSize: true,
    matchDate: false,
    matchHash: true,
    matchExtension: false,
    hashAlgorithm: 'sha256',
    minSizeBytes: 200,
    maxSizeBytes: 0,
    includeExtensions: ['.csv'],
    customExtensions: ['.csv'],
    excludeExtensions: [],
    includeHidden: false,
    modifiedAfterMs: 0,
    modifiedBeforeMs: 0
  };

  const groups = await findDuplicates([tmpDir], criteria, new ScanCancellationToken(), () => {});
  assert.equal(groups.length, 1);
  assert.equal(groups[0].files.length, 2);
  assert.ok(groups[0].files.every((f) => f.path.endsWith('.csv')));
  assert.ok(groups[0].files.every((f) => f.size >= 200));

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Scanner: Nomi Simili raggruppa remix senza richiedere hash identico', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-fuzzy-'));
  await fsp.writeFile(path.join(tmpDir, 'Canzone.mp3'), 'audio-originale');
  await fsp.writeFile(path.join(tmpDir, 'Canzone (Remix).mp3'), 'audio-remix-diverso');
  await fsp.writeFile(path.join(tmpDir, 'Relazione-finale.pdf'), 'documento');

  const criteria = {
    matchName: false,
    matchFuzzyName: true,
    matchSize: false,
    matchDate: false,
    matchHash: false,
    matchExtension: false,
    hashAlgorithm: 'sha256',
    minSizeBytes: 0,
    maxSizeBytes: 0,
    includeExtensions: [],
    excludeExtensions: [],
    includeHidden: false
  };

  const groups = await findDuplicates([tmpDir], criteria, new ScanCancellationToken(), () => {});
  assert.equal(groups.length, 1, 'I due mp3 devono formare un solo gruppo fuzzy');
  assert.equal(groups[0].files.length, 2);
  assert.equal(groups[0].matchReason, 'fuzzy');
  assert.ok(groups[0].files.every((f) => /Canzone/i.test(f.name)));

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Hasher: percorso vuoto rifiutato senza UnhandledPromiseRejection', async () => {
  await assert.rejects(
    () => computeFullHash('', 'sha256'),
    /Percorso file vuoto/
  );
  await assert.rejects(
    () => computePartialHash('   ', 'sha256'),
    /Percorso file vuoto/
  );
});

test('Scanner: elenco cartelle vuoto o path non validi lancia a monte', async () => {
  await assert.rejects(() => findDuplicates([], {}, new ScanCancellationToken(), () => {}), /almeno una cartella/);
  await assert.rejects(() => findDuplicates(['', '   '], {}, new ScanCancellationToken(), () => {}), /Nessun percorso cartella valido/);
});

test('classifyMatchReason: priorità hash > fuzzy > name > size', () => {
  assert.equal(classifyMatchReason({ matchName: true, matchSize: true }, { hashed: true }), 'hash');
  assert.equal(classifyMatchReason({ matchFuzzyName: true, matchSize: true }, { fuzzyApplied: true }), 'fuzzy');
  assert.equal(classifyMatchReason({ matchName: true, matchSize: true }, {}), 'name');
  assert.equal(classifyMatchReason({ matchSize: true }, {}), 'size');
});

test('Scanner: stesso nome esatto senza hash classifica matchReason=name', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-name-'));
  await fsp.writeFile(path.join(tmpDir, 'stesso.txt'), 'alpha');
  await fsp.mkdir(path.join(tmpDir, 'sub'));
  await fsp.writeFile(path.join(tmpDir, 'sub', 'stesso.txt'), 'beta-diverso');

  const groups = await findDuplicates([tmpDir], {
    matchName: true,
    matchSize: false,
    matchHash: false,
    matchFuzzyName: false,
    matchExtension: false,
    matchDate: false,
    hashAlgorithm: 'sha256',
    minSizeBytes: 0,
    maxSizeBytes: 0,
    includeExtensions: [],
    excludeExtensions: [],
    includeHidden: false
  }, new ScanCancellationToken(), () => {});

  assert.equal(groups.length, 1);
  assert.equal(groups[0].matchReason, 'name');
  assert.equal(groups[0].files.length, 2);
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Scanner: sola dimensione senza hash classifica matchReason=size', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-size-'));
  const payload = 'xxxx';
  await fsp.writeFile(path.join(tmpDir, 'a.bin'), payload);
  await fsp.writeFile(path.join(tmpDir, 'b.bin'), payload);

  const groups = await findDuplicates([tmpDir], {
    matchName: false,
    matchSize: true,
    matchHash: false,
    matchFuzzyName: false,
    matchExtension: false,
    matchDate: false,
    hashAlgorithm: 'sha256',
    minSizeBytes: 0,
    maxSizeBytes: 0,
    includeExtensions: [],
    excludeExtensions: [],
    includeHidden: false
  }, new ScanCancellationToken(), () => {});

  assert.equal(groups.length, 1);
  assert.equal(groups[0].matchReason, 'size');
  await fsp.rm(tmpDir, { recursive: true, force: true });
});
