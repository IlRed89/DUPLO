/**
 * @file flattenWinZip.js
 * @description Hook electron-builder `afterAllArtifactBuild`.
 * Rigenera gli ZIP Windows con `archiver`: ogni entry è relativa a
 * `win-unpacked` / `win-ia32-unpacked`, quindi exe e dll stanno in RADICE
 * (niente cartella padre tipo DupFinder-win32-x64/).
 */

const fs = require('fs');
const path = require('path');

/**
 * Crea uno zip i cui path sono relativi a `sourceDir` (nessun prefisso padre).
 *
 * @param {string} sourceDir - es. dist/win-unpacked
 * @param {string} destZip
 * @returns {Promise<void>}
 */
function writeFlatZip(sourceDir, destZip) {
  return new Promise((resolve, reject) => {
    try {
      const archiver = require('archiver');
      const parent = path.dirname(destZip);
      if (parent && !fs.existsSync(parent)) {
        fs.mkdirSync(parent, { recursive: true });
      }
      const tmp = destZip + '.flat-tmp.zip';
      const output = fs.createWriteStream(tmp);
      // compressione standard: lo zip deve aprirsi su Explorer senza tool extra
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        try {
          fs.renameSync(tmp, destZip);
          console.log(`[flattenWinZip] Scritti ${archive.pointer()} byte in ${destZip}`);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      output.on('error', (err) => {
        reject(err);
      });
      archive.on('warning', (err) => {
        console.warn(`[flattenWinZip] warning: ${err.message}`);
      });
      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      // `false` = non wrappare in una sottocartella: file in root dello zip
      archive.directory(sourceDir, false);
      archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * @param {string} zipPath
 * @param {string} outDir
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
      await writeFlatZip(sourceDir, zipPath);
      rebuilt.push(zipPath);
    } catch (err) {
      console.error('[flattenWinZip] Errore su', zipPath, err.message);
    }
  }

  return rebuilt;
}

module.exports = flattenWinZip;
module.exports.default = flattenWinZip;
module.exports.writeFlatZip = writeFlatZip;
module.exports.unpackedDirForZip = unpackedDirForZip;
