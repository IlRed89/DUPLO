/**
 * @file flattenWinZip.test.js
 * @description Lo zip di release avvolge i file in una cartella omonima all'archivio.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  writeReleaseZip,
  unpackedDirForZip,
  zipWrapperName
} = require('../scripts/flattenWinZip');

test('zipWrapperName è lo stem dello zip, mai win-unpacked', () => {
  assert.equal(zipWrapperName('/out/DUPLO-1.0.0-win-x64.zip'), 'DUPLO-1.0.0-win-x64');
  assert.equal(zipWrapperName('/out/DUPLO-1.0.0-win-ia32.zip'), 'DUPLO-1.0.0-win-ia32');
  assert.equal(zipWrapperName('/out/DUPLO-1.0.0-linux-x64.zip'), 'DUPLO-1.0.0-linux-x64');
  assert.notEqual(zipWrapperName('/out/DUPLO-1.0.0-win-x64.zip'), 'win-unpacked');
});

test('unpackedDirForZip sceglie la cartella di build electron-builder', () => {
  assert.equal(
    unpackedDirForZip('/out/DUPLO-1.0.0-win-ia32.zip', '/out'),
    path.join('/out', 'win-ia32-unpacked')
  );
  assert.equal(
    unpackedDirForZip('/out/DUPLO-1.0.0-ia32-win.zip', '/out'),
    path.join('/out', 'win-ia32-unpacked')
  );
  assert.equal(
    unpackedDirForZip('/out/DUPLO-1.0.0-win-x64.zip', '/out'),
    path.join('/out', 'win-unpacked')
  );
});

test('writeReleaseZip avvolge i file in DUPLO-…-win, non in win-unpacked', async () => {
  let archiverOk = true;
  try {
    require('archiver');
  } catch (_err) {
    archiverOk = false;
  }
  if (!archiverOk) {
    return;
  }

  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-namedzip-'));
  const unpacked = path.join(tmp, 'win-unpacked');
  await fsp.mkdir(unpacked, { recursive: true });
  await fsp.writeFile(path.join(unpacked, 'DUPLO.exe'), 'fake-exe');
  await fsp.writeFile(path.join(unpacked, 'ffmpeg.dll'), 'fake-dll');
  const zipPath = path.join(tmp, 'DUPLO-1.0.0-win-x64.zip');

  await writeReleaseZip(unpacked, zipPath);
  assert.ok(fs.existsSync(zipPath));

  const py = process.platform === 'win32' ? 'python' : 'python3';
  const listed = spawnSync(py, ['-c', 'import zipfile,sys; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zipPath], {
    encoding: 'utf8'
  });
  assert.equal(listed.status, 0, listed.stderr);
  const names = listed.stdout.split(/\r?\n/).filter(Boolean);
  const prefix = 'DUPLO-1.0.0-win-x64/';
  assert.ok(
    names.some((n) => n === prefix + 'DUPLO.exe' || n === 'DUPLO-1.0.0-win-x64\\DUPLO.exe'),
    `entries=${names.join(',')}`
  );
  assert.ok(names.some((n) => n.replace(/\\/g, '/').endsWith('ffmpeg.dll')));
  assert.ok(names.every((n) => !n.replace(/\\/g, '/').startsWith('win-unpacked/')));
  assert.ok(names.every((n) => n.replace(/\\/g, '/').startsWith(prefix) || n.replace(/\\/g, '/') === 'DUPLO-1.0.0-win-x64'));

  await fsp.rm(tmp, { recursive: true, force: true });
});
