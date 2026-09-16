/**
 * @file flattenWinZip.test.js
 * @description Verifica che lo zip Windows non abbia una cartella padre.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { writeFlatZip, unpackedDirForZip } = require('../scripts/flattenWinZip');

test('unpackedDirForZip sceglie win-unpacked o win-ia32-unpacked dal nome zip', () => {
  assert.equal(
    unpackedDirForZip('/out/DUPLO-1.0.0-ia32-win.zip', '/out'),
    path.join('/out', 'win-ia32-unpacked')
  );
  assert.equal(
    unpackedDirForZip('/out/DUPLO-1.0.0-win.zip', '/out'),
    path.join('/out', 'win-unpacked')
  );
});

test('writeFlatZip mette i file in radice senza cartella padre', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-flatzip-'));
  const unpacked = path.join(tmp, 'win-unpacked');
  await fsp.mkdir(unpacked, { recursive: true });
  await fsp.writeFile(path.join(unpacked, 'DUPLO.exe'), 'fake-exe');
  await fsp.writeFile(path.join(unpacked, 'ffmpeg.dll'), 'fake-dll');
  const zipPath = path.join(tmp, 'DUPLO-1.0.0-win.zip');

  await writeFlatZip(unpacked, zipPath);
  assert.ok(fs.existsSync(zipPath));

  const py = process.platform === 'win32' ? 'python' : 'python3';
  const listed = spawnSync(py, ['-c', 'import zipfile,sys; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zipPath], {
    encoding: 'utf8'
  });
  assert.equal(listed.status, 0, listed.stderr);
  const names = listed.stdout.split(/\r?\n/).filter(Boolean);
  assert.ok(names.includes('DUPLO.exe'), `entries=${names.join(',')}`);
  assert.ok(names.includes('ffmpeg.dll'));
  assert.ok(names.every((n) => !n.startsWith('win-unpacked/') && !n.startsWith('DUPLO-1.0.0-win/')));

  await fsp.rm(tmp, { recursive: true, force: true });
});
