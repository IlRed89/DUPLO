/**
 * @file dropFilter.js
 * @description Filtra i path provenienti da un drop HTML5: tiene solo le directory.
 * Isolato da Electron così i test Node possono iniettare uno stub di fs.statSync.
 * Ogni voce viene loggata (accettata, file, path illeggibile).
 */

const fs = require('fs');
const { logger } = require('./logger');
const { normalizeCrossPlatformPath } = require('./scanner');

/**
 * @typedef {Object} DropSkip
 * @property {string} path
 * @property {string} reason
 */

/**
 * @typedef {Object} DropFilterResult
 * @property {string[]} directories
 * @property {DropSkip[]} skipped
 */

/**
 * Verifica ogni path con `statSync` in try/catch (file, inesistenti, EACCES).
 *
 * @param {unknown} rawPaths - Elenco grezzo da `dataTransfer.files[].path`
 * @param {{ statSync?: function(string): import('fs').Stats }} [io]
 * @returns {DropFilterResult}
 */
function filterDirectoryPaths(rawPaths, io = {}) {
  const statSync = typeof io.statSync === 'function' ? io.statSync : fs.statSync.bind(fs);
  const directories = [];
  const skipped = [];
  const list = Array.isArray(rawPaths) ? rawPaths : [];

  logger.info(`[Drop] Filtro di ${list.length} path trascinati`);

  for (const raw of list) {
    try {
      const normalized = normalizeCrossPlatformPath(String(raw || ''));
      if (!normalized) {
        skipped.push({ path: String(raw), reason: 'percorso vuoto' });
        logger.warn('[Drop] Path vuoto ignorato');
        continue;
      }
      const stats = statSync(normalized);
      if (stats.isDirectory()) {
        directories.push(normalized);
        logger.info(`[Drop] Accettata cartella: "${normalized}"`);
      } else {
        skipped.push({ path: normalized, reason: 'non è una cartella' });
        logger.warn(`[Drop] Ignorato (non directory): "${normalized}"`);
      }
    } catch (err) {
      skipped.push({ path: String(raw), reason: `${err.code || 'ERR'}: ${err.message}` });
      logger.warn(`[Drop] Non leggibile "${raw}": [${err.code || 'UNKNOWN'}] ${err.message}`);
    }
  }

  logger.info(`[Drop] Esito: ${directories.length} cartelle, ${skipped.length} scartati`);
  return { directories, skipped };
}

module.exports = { filterDirectoryPaths };
