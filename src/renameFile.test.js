/**
 * @file renameFile.test.js
 * @description Validazione destinazione + rinomina dopo hash (niente fd appeso).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { computeFullHash } = require('./hasher');
const { resolveRenameDestination, renameFileOnDisk, pathsReferToSameFile } = require('./renameFile');

test('resolveRenameDestination rifiuta path, caratteri illegali e nomi vuoti', () => {
  const src = path.join(os.tmpdir(), 'foto.jpg');
  assert.equal(resolveRenameDestination(src, '').ok, false);
  assert.equal(resolveRenameDestination(src, '../escape.jpg').ok, false);
  assert.equal(resolveRenameDestination(src, 'a/b.jpg').ok, false);
  assert.equal(resolveRenameDestination(src, 'bad:name.jpg').ok, false);
  assert.equal(resolveRenameDestination(src, 'CON.jpg').ok, false);
  assert.equal(resolveRenameDestination(src, 'fine.').ok, false);
});

test('resolveRenameDestination resta nella stessa cartella e conserva estensione', () => {
  const src = path.join(os.tmpdir(), 'album', 'foto.jpg');
  const withExt = resolveRenameDestination(src, 'copia.jpg');
  assert.equal(withExt.ok, true);
  assert.equal(withExt.finalName, 'copia.jpg');
  assert.equal(path.dirname(withExt.destPath), path.dirname(src));

  const noExt = resolveRenameDestination(src, 'copia');
  assert.equal(noExt.ok, true);
  assert.equal(noExt.finalName, 'copia.jpg');
});

test('pathsReferToSameFile è case-insensitive solo su win32', () => {
  const a = path.join(os.tmpdir(), 'Foto.JPG');
  const b = path.join(os.tmpdir(), 'foto.jpg');
  if (process.platform === 'win32') {
    assert.equal(pathsReferToSameFile(a, b), true);
  } else {
    assert.equal(pathsReferToSameFile(a, a), true);
    assert.equal(pathsReferToSameFile(a, b), a === b);
  }
});

test('renameFileOnDisk rinomina dopo computeFullHash (fd stream chiuso)', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-rename-'));
  const src = path.join(tmpDir, 'originale.txt');
  await fsp.writeFile(src, 'contenuto da rinominare dopo hashing DUPLO\n'.repeat(50));

  const digest = await computeFullHash(src, 'sha256');
  assert.match(digest, /^[a-f0-9]{64}$/);

  const result = await renameFileOnDisk(src, 'rinominato.txt');
  assert.equal(result.success, true, result.error);
  assert.equal(path.basename(result.newPath), 'rinominato.txt');
  assert.equal(fs.existsSync(src), false);
  assert.equal(fs.existsSync(result.newPath), true);

  const again = await renameFileOnDisk(result.newPath, 'rinominato.txt');
  assert.equal(again.success, true);
  assert.equal(again.newPath, result.newPath);

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('renameFileOnDisk rifiuta il conflitto con un file già presente', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-rename-clash-'));
  const src = path.join(tmpDir, 'a.txt');
  const other = path.join(tmpDir, 'b.txt');
  await fsp.writeFile(src, 'a');
  await fsp.writeFile(other, 'b');
  const result = await renameFileOnDisk(src, 'b.txt');
  assert.equal(result.success, false);
  assert.equal(result.code, 'EEXIST');
  await fsp.rm(tmpDir, { recursive: true, force: true });
});
