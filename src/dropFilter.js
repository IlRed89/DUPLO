/**
 * @file dropFilter.js
 * @description Filtra i path provenienti da un drop HTML5: tiene solo le directory.
 * Isolato da Electron così i test Node possono iniettare uno stub di fs.statSync.
 * Ogni voce viene loggata (accettata, file, path illeggibile).
 */

const fs = require('fs');
const fsp = fs.promises;
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

/**
 * Validazione asincrona di UN path droppato (`fs.promises.stat` + `isDirectory`).
 * I file singoli vengono ignorati (non si prende la cartella padre: rischierebbe
 * di scansionare alberi enormi per un drop accidentale di un file).
 *
 * @param {unknown} rawPath
 * @param {{ stat?: function(string): Promise<import('fs').Stats> }} [io]
 * @returns {Promise<{ok: boolean, directory: string|null, skipped: DropSkip|null}>}
 */
async function validateDroppedPath(rawPath, io = {}) {
  const statFn = typeof io.stat === 'function' ? io.stat : fsp.stat.bind(fsp);
  const raw = rawPath == null ? '' : String(rawPath);
  logger.info(`[Drop] validate-and-add-folder: ${JSON.stringify(raw)}`);

  try {
    const normalized = normalizeCrossPlatformPath(raw);
    if (!normalized) {
      logger.warn('[Drop] Path vuoto ignorato');
      return { ok: false, directory: null, skipped: { path: raw, reason: 'percorso vuoto' } };
    }

    const stats = await statFn(normalized);
    if (stats && typeof stats.isDirectory === 'function' && stats.isDirectory()) {
      logger.info(`[Drop] Accettata cartella: "${normalized}"`);
      return { ok: true, directory: normalized, skipped: null };
    }

    const kind = stats && typeof stats.isFile === 'function' && stats.isFile() ? 'file' : 'non-directory';
    logger.warn(`[Drop] Ignorato (${kind}, non è una cartella): "${normalized}"`);
    return { ok: false, directory: null, skipped: { path: normalized, reason: 'non è una cartella' } };
  } catch (err) {
    const code = err && err.code ? err.code : 'ERR';
    const message = err && err.message ? err.message : String(err);
    logger.warn(`[Drop] Non leggibile "${raw}": [${code}] ${message}`);
    return { ok: false, directory: null, skipped: { path: raw, reason: `${code}: ${message}` } };
  }
}

/**
 * Filtro asincrono di un elenco di path (stesso contratto di `filterDirectoryPaths`).
 *
 * @param {unknown} rawPaths
 * @param {{ stat?: function(string): Promise<import('fs').Stats> }} [io]
 * @returns {Promise<DropFilterResult>}
 */
async function filterDirectoryPathsAsync(rawPaths, io = {}) {
  const list = Array.isArray(rawPaths) ? rawPaths : [];
  const directories = [];
  const skipped = [];
  logger.info(`[Drop] Filtro async di ${list.length} path trascinati`);
  for (const raw of list) {
    const result = await validateDroppedPath(raw, io);
    if (result.ok && result.directory) directories.push(result.directory);
    else if (result.skipped) skipped.push(result.skipped);
  }
  logger.info(`[Drop] Esito async: ${directories.length} cartelle, ${skipped.length} scartati`);
  return { directories, skipped };
}

module.exports = { filterDirectoryPaths, filterDirectoryPathsAsync, validateDroppedPath };
