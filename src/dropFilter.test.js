const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { filterDirectoryPaths } = require('./dropFilter');

test('filterDirectoryPaths tiene solo le directory e scarta i file', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-drop-'));
  const nested = path.join(tmpDir, 'cartella');
  const filePath = path.join(tmpDir, 'file.txt');
  await fsp.mkdir(nested);
  await fsp.writeFile(filePath, 'non una cartella');

  const result = filterDirectoryPaths([nested, filePath, '', path.join(tmpDir, 'inesistente')]);

  assert.deepEqual(result.directories, [path.resolve(nested)]);
  assert.equal(result.skipped.length, 3);
  assert.ok(result.skipped.some((item) => item.reason === 'non è una cartella'));
  assert.ok(result.skipped.some((item) => item.reason === 'percorso vuoto'));
  assert.ok(result.skipped.some((item) => /ENOENT/.test(item.reason)));

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('filterDirectoryPaths usa lo stub di statSync senza toccare il disco', () => {
  const fakeStat = (p) => ({
    isDirectory: () => String(p).includes('dir')
  });
  const result = filterDirectoryPaths(['/tmp/dir-a', '/tmp/file-b'], { statSync: fakeStat });
  assert.equal(result.directories.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, 'non è una cartella');
});

test('validateDroppedPath accetta directory e scarta i file con fs.promises.stat', async () => {
  const { validateDroppedPath, filterDirectoryPathsAsync } = require('./dropFilter');
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'duplo-drop-async-'));
  const nested = path.join(tmpDir, 'cartella');
  const filePath = path.join(tmpDir, 'file.txt');
  await fsp.mkdtemp && await fsp.mkdir(nested);
  await fsp.writeFile(filePath, 'non una cartella');

  const ok = await validateDroppedPath(nested);
  const file = await validateDroppedPath(filePath);
  const empty = await validateDroppedPath('');
  const missing = await validateDroppedPath(path.join(tmpDir, 'inesistente'));
  const batch = await filterDirectoryPathsAsync([nested, filePath]);

  assert.equal(ok.ok, true);
  assert.equal(ok.directory, path.resolve(nested));
  assert.equal(file.ok, false);
  assert.equal(file.skipped.reason, 'non è una cartella');
  assert.equal(empty.ok, false);
  assert.ok(/ENOENT/.test(missing.skipped.reason));
  assert.deepEqual(batch.directories, [path.resolve(nested)]);
  assert.equal(batch.skipped.length, 1);

  await fsp.rm(tmpDir, { recursive: true, force: true });
});
