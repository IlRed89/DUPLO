/**
 * @file flattenWinZip.js
 * @description Hook electron-builder `afterAllArtifactBuild`.
 *
 * electron-builder lascia i binari in `dist/win-unpacked` (o `win-ia32-unpacked`).
 * Questo hook rigenera lo ZIP così che, aprendo l'archivio, la cartella padre
 * abbia **lo stesso nome del file zip** (es. `DUPLO-1.0.0-win-x64/DUPLO.exe`),
 * non `win-unpacked/`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Nome della cartella dentro lo zip = basename dell'archivio senza `.zip`.
 *
 * @param {unknown} zipPath es. `dist/DUPLO-1.0.0-win-x64.zip`
 * @returns {string}
 */
function zipWrapperName(zipPath) {
  const base = path.basename(String(zipPath || ''));
  const stem = base.replace(/\.zip$/i, '').trim();
  return stem || 'DUPLO';
}

/**
 * Cartella `dist/*-unpacked` da cui electron-builder ha copiato i binari.
 * Non è il nome visibile nello zip: resta un dettaglio di build.
 *
 * @param {string} zipPath
 * @param {string} outDir
 * @returns {string}
 */
function unpackedDirForZip(zipPath, outDir) {
  const base = path.basename(zipPath).toLowerCase();
  if (base.includes('ia32')) {
    return path.join(outDir, 'win-ia32-unpacked');
  }
  return path.join(outDir, 'win-unpacked');
}

/**
 * Scrive uno zip la cui unica cartella radice è `zipWrapperName(destZip)`.
 *
 * @param {string} sourceDir Cartella unpacked (file in radice: exe, dll, …).
 * @param {string} destZip Percorso dello zip da produrre.
 * @returns {Promise<void>}
 * @throws {Error} Se `sourceDir` non esiste o archiver fallisce.
 */
function writeReleaseZip(sourceDir, destZip) {
  const wrapper = zipWrapperName(destZip);
  return new Promise((resolve, reject) => {
    try {
      const archiver = require('archiver');
      const parent = path.dirname(destZip);
      if (parent && !fs.existsSync(parent)) {
        fs.mkdirSync(parent, { recursive: true });
      }
      const tmp = destZip + '.named-tmp.zip';
      const output = fs.createWriteStream(tmp);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        try {
          fs.renameSync(tmp, destZip);
          console.log(`[flattenWinZip] ${archive.pointer()} byte in ${destZip} (cartella ${wrapper}/)`);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      output.on('error', reject);
      archive.on('warning', (err) => {
        console.warn(`[flattenWinZip] warning: ${err.message}`);
      });
      archive.on('error', reject);

      archive.pipe(output);
      // Secondo argomento = prefisso dentro lo zip (non `false`: eviterebbe la cartella).
      archive.directory(sourceDir, wrapper);
      archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

/** @deprecated alias: il nome storico restava "piatto"; ora avvolge con il nome zip. */
const writeFlatZip = writeReleaseZip;

/**
 * Firma richiesta da electron-builder.
 *
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
      console.log('[flattenWinZip] ZIP nominato:', zipPath, '←', sourceDir, '→', zipWrapperName(zipPath) + '/');
      await writeReleaseZip(sourceDir, zipPath);
      rebuilt.push(zipPath);
    } catch (err) {
      console.error('[flattenWinZip] Errore su', zipPath, err.message);
    }
  }

  return rebuilt;
}

module.exports = flattenWinZip;
module.exports.default = flattenWinZip;
module.exports.writeReleaseZip = writeReleaseZip;
module.exports.writeFlatZip = writeFlatZip;
module.exports.unpackedDirForZip = unpackedDirForZip;
module.exports.zipWrapperName = zipWrapperName;
