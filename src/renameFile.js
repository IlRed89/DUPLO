/**
 * @file renameFile.js
 * @description Rinomina su disco (Main Process). Isolata da Electron così è testabile.
 *
 * Contratto:
 * - il renderer manda solo il *basename* (niente slash, niente `..`);
 * - la destinazione resta nella stessa cartella del file originale;
 * - se l'utente omette l'estensione, si riusa quella del file sorgente;
 * - su Windows `EBUSY`/`EPERM`/`EACCES` (antivirus, fd hash ancora aperto)
 *   vengono ritentati con backoff. Un ReadStream non `destroy()`-ato è la
 *   causa classica: lo hasher deve chiudere il descriptor *prima* del rename.
 */

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { logger } = require('./logger');

/** Backoff (ms) su lock Windows: subito, 150ms, 400ms. */
const BUSY_RETRY_MS = [0, 150, 400];

/**
 * Attende `ms` millisecondi.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  const n = Number(ms);
  return new Promise(function (resolve) {
    setTimeout(resolve, Number.isFinite(n) && n > 0 ? n : 0);
  });
}

/**
 * True se i due path puntano allo stesso file (Windows: case-insensitive).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function pathsReferToSameFile(a, b) {
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  if (process.platform === 'win32' && a.toLowerCase() === b.toLowerCase()) {
    return true;
  }
  return false;
}

/**
 * Costruisce il path di destinazione nella stessa cartella.
 *
 * @param {string} oldPath Percorso assoluto attuale.
 * @param {unknown} newName Basename richiesto dall'utente.
 * @returns {{ ok: true, destPath: string, finalName: string } | { ok: false, error: string, code: string }}
 */
function resolveRenameDestination(oldPath, newName) {
  const trimmed = String(newName || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Il nuovo nome non può essere vuoto', code: 'EINVAL' };
  }
  if (/[/\\]/.test(trimmed) || trimmed.indexOf('\0') !== -1 || trimmed === '.' || trimmed === '..') {
    logger.warn('[Rename] rifiutato: nome non valido "' + trimmed + '"');
    return { ok: false, error: 'Il nuovo nome non può contenere percorsi o caratteri riservati', code: 'EINVAL' };
  }
  if (/[<>:"|?*\x00-\x1f]/.test(trimmed) {
    logger.warn('[Rename] rifiutato: caratteri Windows non validi in "' + trimmed + '"');
    return { ok: false, error: 'Il nuovo nome contiene caratteri non validi (<>:"/\\|?*)', code: 'EINVAL' };
  }
  if (/[. ]$/.test(trimmed)) {
    logger.warn('[Rename] rifiutato: spazio o punto finale in "' + trimmed + '"');
    return { ok: false, error: 'Il nuovo nome non può terminare con uno spazio o un punto', code: 'EINVAL' };
  }
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  if (reserved.test(trimmed)) {
    logger.warn('[Rename] rifiutato: nome riservato Windows "' + trimmed + '"');
    return { ok: false, error: 'Il nuovo nome è riservato dal sistema operativo', code: 'EINVAL' };
  }
  const base = path.basename(trimmed);
  if (base !== trimmed) {
    return { ok: false, error: 'Il nuovo nome deve essere un nome file, non un percorso', code: 'EINVAL' };
  }

  const dir = path.dirname(oldPath);
  const oldExt = path.extname(oldPath);
  const finalName = path.extname(base) ? base : base + oldExt;
  const destPath = path.join(dir, finalName);
  if (path.dirname(destPath) !== dir) {
    return { ok: false, error: 'Destinazione di rinomina fuori dalla cartella originale', code: 'EINVAL' };
  }
  logger.info('[Rename] destinazione: "' + finalName + '" → "' + destPath + '"');
  return { ok: true, destPath: destPath, finalName: finalName };
}

/**
 * Rinomina `oldPath` in `destPath`. Su Windows un cambio solo di maiuscole
 * richiede un passaggio intermedio (NTFS è case-insensitive).
 *
 * @param {string} oldPath
 * @param {string} destPath
 * @returns {Promise<void>}
 */
async function renameOnce(oldPath, destPath) {
  if (process.platform === 'win32' && oldPath !== destPath && oldPath.toLowerCase() === destPath.toLowerCase()) {
    const tmpPath = oldPath + '.duplo-ren';
    logger.info('[Rename] cambio solo maiuscole via tmp "' + tmpPath + '"');
    await fsp.rename(oldPath, tmpPath);
    try {
      await fsp.rename(tmpPath, destPath);
    } catch (err) {
      try {
        await fsp.rename(tmpPath, oldPath);
      } catch (_restoreErr) {
        logger.error('[Rename] rollback case-change fallito: ' + (_restoreErr && _restoreErr.message));
      }
      throw err;
    }
    return;
  }
  await fsp.rename(oldPath, destPath);
}

/**
 * Esegue la rinomina con validazione, conflitto e retry su lock.
 *
 * @param {string} oldPath Percorso assoluto attuale.
 * @param {unknown} newName Basename (senza cartella).
 * @returns {Promise<{success: boolean, oldPath?: string, newPath?: string, error?: string, code?: string}>}
 */
async function renameFileOnDisk(oldPath, newName) {
  const source = String(oldPath || '').trim();
  logger.info('[Rename] richiesto: "' + source + '" → nome "' + newName + '"');

  if (!source) {
    logger.warn('[Rename] percorso sorgente vuoto');
    return { success: false, error: 'Percorso file mancante', code: 'EINVAL' };
  }

  const dest = resolveRenameDestination(source, newName);
  if (!dest.ok) {
    return { success: false, error: dest.error, code: dest.code || 'EINVAL' };
  }

  if (dest.destPath === source) {
    logger.info('[Rename] nome invariato per "' + source + '"');
    return { success: true, oldPath: source, newPath: source };
  }

  try {
    await fsp.access(source, fs.constants.F_OK);
  } catch (err) {
    logger.error('[Rename] sorgente assente "' + source + '": [' + (err.code || 'UNKNOWN') + '] ' + err.message);
    return { success: false, error: err.message, code: err.code || 'ENOENT' };
  }

  const sameInode = pathsReferToSameFile(source, dest.destPath);
  if (!sameInode) {
    try {
      await fsp.access(dest.destPath, fs.constants.F_OK);
      logger.warn('[Rename] bloccato: destinazione già esistente "' + dest.destPath + '"');
      return {
        success: false,
        error: 'Esiste già un file chiamato "' + dest.finalName + '"',
        code: 'EEXIST'
      };
    } catch (existsErr) {
      if (existsErr.code !== 'ENOENT') {
        logger.error('[Rename] stat destinazione "' + dest.destPath + '": ' + existsErr.message);
        return { success: false, error: existsErr.message, code: existsErr.code || 'ERR' };
      }
    }
  }

  let lastErr = null;
  for (let i = 0; i < BUSY_RETRY_MS.length; i += 1) {
    const wait = BUSY_RETRY_MS[i];
    if (wait > 0) {
      logger.warn('[Rename] retry ' + (i + 1) + '/' + BUSY_RETRY_MS.length + ' dopo ' + wait + 'ms (' +
        ((lastErr && lastErr.code) || 'lock') + ') su "' + source + '"');
      await sleep(wait);
    }
    try {
      await renameOnce(source, dest.destPath);
      logger.info('[Rename] ok: "' + source + '" → "' + dest.destPath + '"');
      return { success: true, oldPath: source, newPath: dest.destPath };
    } catch (err) {
      lastErr = err;
      const code = err && err.code;
      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        logger.warn('[Rename] ' + code + ' su "' + source + '": ' + err.message);
        continue;
      }
      logger.error('[Rename] fallito "' + source + '" → "' + dest.destPath + '": [' +
        (code || 'UNKNOWN') + '] ' + err.message);
      return { success: false, error: err.message, code: code || 'ERR' };
    }
  }

  logger.error('[Rename] EBUSY persistente dopo retry "' + source + '": ' +
    ((lastErr && lastErr.message) || 'resource busy or locked'));
  return {
    success: false,
    error: (lastErr && lastErr.message) || 'EBUSY: resource busy or locked',
    code: (lastErr && lastErr.code) || 'EBUSY'
  };
}

module.exports = {
  BUSY_RETRY_MS,
  sleep,
  pathsReferToSameFile,
  resolveRenameDestination,
  renameFileOnDisk
};
