/**
 * @file flattenWinZip.js
 * @description Hook electron-builder `afterAllArtifactBuild`.
 * Rigenera gli ZIP Windows mettendo exe/dll/pak alla RADICE dell'archivio
 * (niente cartella padre tipo DupFinder-1.0.0-win/).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Crea uno zip i cui entry point sono relativi a `sourceDir` (nessun prefisso padre).
 * Usa Python 3 della macchina di build (già presente in CI Linux e su macOS).
 *
 * @param {string} sourceDir - es. dist/win-unpacked
 * @param {string} destZip
 */
function writeFlatZip(sourceDir, destZip) {
  const script = [
    'import os, sys, zipfile',
    'src, dest = sys.argv[1], sys.argv[2]',
    'parent = os.path.dirname(dest)',
    'if parent and not os.path.isdir(parent):',
    '    os.makedirs(parent)',
    'with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:',
    '    for root, dirs, files in os.walk(src):',
    '        for name in files:',
    '            full = os.path.join(root, name)',
    '            rel = os.path.relpath(full, src).replace(os.sep, "/")',
    '            zf.write(full, rel)'
  ].join('\n');

  const tmp = destZip + '.flat-tmp.zip';
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(py, ['-c', script, sourceDir, tmp], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || 'zip piatto fallito').trim();
    throw new Error(err);
  }
  fs.renameSync(tmp, destZip);
}

/**
 * @param {string} zipPath
 * @returns {string} cartella unpacked corrispondente
 */
function unpackedDirForZip(zipPath, outDir) {
  const base = path.basename(zipPath).toLowerCase();
  if (base.includes('ia32')) {
    return path.join(outDir, 'win-ia32-unpacked');
  }
  return path.join(outDir, 'win-unpacked');
}

/**
 * Firma richiesta da electron-builder.
 * @param {{ artifactPaths?: string[], outDir?: string }} context
 * @returns {Promise<string[]>}
 */
async function flattenWinZip(context) {
  const outDir = (context && context.outDir) || path.join(__dirname, '..', 'dist');
  const artifacts = (context && context.artifactPaths) || [];
  const rebuilt = [];

  for (const zipPath of artifacts) {
    try {
      if (!zipPath || !String(zipPath).toLowerCase().endsWith('.zip')) {
        continue;
      }
      if (!/win/i.test(path.basename(zipPath))) {
        continue;
      }
      const sourceDir = unpackedDirForZip(zipPath, outDir);
      if (!fs.existsSync(sourceDir)) {
        console.warn('[flattenWinZip] unpacked assente, salto', sourceDir);
        continue;
      }
      console.log('[flattenWinZip] ZIP piatto:', zipPath, '←', sourceDir);
      writeFlatZip(sourceDir, zipPath);
      rebuilt.push(zipPath);
    } catch (err) {
      console.error('[flattenWinZip] Errore su', zipPath, err.message);
    }
  }

  return rebuilt;
}

// electron-builder carica afterAllArtifactBuild come default export.
module.exports = flattenWinZip;
module.exports.default = flattenWinZip;
module.exports.writeFlatZip = writeFlatZip;
module.exports.unpackedDirForZip = unpackedDirForZip;
