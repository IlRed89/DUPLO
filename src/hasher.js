/**
 * @file hasher.js
 * @description Calcolo asincrono degli hash dei file con `crypto` nativo Node.js.
 *
 * Strategia a due stadi, usata da `scanner.js`:
 * 1. Hash parziale dei primi N byte (default 1 MiB): scarta in fretta file
 *    della stessa dimensione ma con testa diversa, evitando di leggere GB.
 * 2. Hash completo a stream da 64 KiB: solo se i chunk iniziali coincidono.
 *    Lo stream non carica mai l'intero file in RAM.
 *
 * Su Windows un ReadStream lasciato aperto tiene un file descriptor e può
 * bloccare `unlink` (EBUSY). Ogni Promise chiude e `destroy()` lo stream
 * sia in caso di successo sia di errore.
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { logger } = require('./logger');

/** Dimensione del pre-hash: 1 MiB (1024 * 1024 byte). */
const DEFAULT_CHUNK_SIZE = 1024 * 1024;

/**
 * Normalizza l'algoritmo richiesto dall'UI.
 * Qualsiasi valore diverso da `md5` diventa `sha256` (default sicuro).
 *
 * @param {unknown} algorithm
 * @returns {'sha256'|'md5'}
 */
function normalizeAlgorithm(algorithm) {
  return String(algorithm || 'sha256').toLowerCase() === 'md5' ? 'md5' : 'sha256';
}

/**
 * Distrugge uno stream se è ancora vivo. `destroy()` è idempotente
 * ma va chiamato dopo `removeAllListeners` per non ri-entrare in `error`.
 *
 * @param {import('fs').ReadStream|null|undefined} stream
 * @returns {void}
 */
function destroyStream(stream) {
  if (!stream) return;
  try {
    stream.removeAllListeners();
  } catch (_err) {
    /* stream già chiuso */
  }
  try {
    if (!stream.destroyed && typeof stream.destroy === 'function') {
      stream.destroy();
    }
  } catch (_err) {
    /* destroy su stream già ended: ignorabile */
  }
}

/**
 * Legge un file a stream, aggiorna un hash Node.js, chiude sempre il descriptor.
 *
 * @param {string} filePath Percorso assoluto.
 * @param {string} algorithm `sha256` o `md5`.
 * @param {import('fs').ReadStreamOptions} streamOptions Opzioni `createReadStream`.
 * @param {function(number): void} [onProgress] Byte letti cumulativi.
 * @returns {Promise<string>} Digest esadecimale.
 * @throws {Error} Se `filePath` è vuoto, il file non è leggibile, o lo stream emette `error`.
 */
function hashFileStream(filePath, algorithm, streamOptions, onProgress) {
  const target = String(filePath || '').trim();
  if (!target) {
    return Promise.reject(new Error('Percorso file vuoto per il calcolo hash'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let stream = null;
    const hash = crypto.createHash(normalizeAlgorithm(algorithm));
    let bytesRead = 0;

    /**
     * Chiude lo stream una sola volta e completa la Promise.
     * @param {Error|null} err
     * @param {string|null} digest
     */
    const settle = (err, digest) => {
      if (settled) return;
      settled = true;
      destroyStream(stream);
      if (err) reject(err);
      else resolve(digest);
    };

    try {
      stream = fs.createReadStream(target, streamOptions);
    } catch (err) {
      settle(err, null);
      return;
    }

    stream.on('data', (chunk) => {
      try {
        hash.update(chunk);
        bytesRead += chunk.length;
        if (typeof onProgress === 'function') onProgress(bytesRead);
      } catch (err) {
        settle(err, null);
      }
    });

    stream.on('end', () => {
      try {
        settle(null, hash.digest('hex'));
      } catch (err) {
        settle(err, null);
      }
    });

    stream.on('error', (err) => {
      settle(err, null);
    });

    // `close` copre il caso Windows in cui il descriptor viene chiuso
    // (antivirus, lock) senza un `end` pulito: senza settle la Promise resterebbe appesa.
    stream.on('close', () => {
      if (!settled) {
        settle(new Error('Stream di lettura chiuso prima del digest hash'), null);
      }
    });
  });
}

/**
 * Hash dei primi `chunkSize` byte (pre-filtro I/O).
 *
 * @param {string} filePath Percorso assoluto del file.
 * @param {string} [algorithm='sha256'] `sha256` o `md5`.
 * @param {number} [chunkSize=DEFAULT_CHUNK_SIZE] Byte da leggere dalla testa.
 * @returns {Promise<string>} Digest esadecimale del chunk.
 * @throws {Error} File illeggibile, permessi, o percorso vuoto.
 */
async function computePartialHash(filePath, algorithm = 'sha256', chunkSize = DEFAULT_CHUNK_SIZE) {
  const size = Number(chunkSize) > 0 ? Number(chunkSize) : DEFAULT_CHUNK_SIZE;
  logger.debug(`[Hasher] Hash parziale (${algorithm}, ${size} B) per: "${filePath}"`);
  try {
    const digest = await hashFileStream(filePath, algorithm, { start: 0, end: size - 1 });
    logger.debug(`[Hasher] Hash parziale ok "${filePath}": ${digest.substring(0, 16)}…`);
    return digest;
  } catch (err) {
    logger.warn(`[Hasher] Hash parziale fallito "${filePath}": [${err.code || 'UNKNOWN'}] ${err.message}`);
    throw err;
  }
}

/**
 * Hash dell'intero file a blocchi da 64 KiB (mai il buffer completo in RAM).
 *
 * @param {string} filePath Percorso assoluto del file.
 * @param {string} [algorithm='sha256'] `sha256` o `md5`.
 * @param {function(number): void} [onProgress] Callback con i byte letti finora.
 * @returns {Promise<string>} Digest esadecimale completo.
 * @throws {Error} File illeggibile, permessi, o percorso vuoto.
 */
async function computeFullHash(filePath, algorithm = 'sha256', onProgress = null) {
  logger.debug(`[Hasher] Hash completo (${algorithm}) per: "${filePath}"`);
  try {
    const digest = await hashFileStream(
      filePath,
      algorithm,
      { highWaterMark: 64 * 1024 },
      onProgress
    );
    logger.debug(`[Hasher] Hash completo ok "${filePath}": ${digest}`);
    return digest;
  } catch (err) {
    logger.warn(`[Hasher] Hash completo fallito "${filePath}": [${err.code || 'UNKNOWN'}] ${err.message}`);
    throw err;
  }
}

module.exports = {
  DEFAULT_CHUNK_SIZE,
  normalizeAlgorithm,
  computePartialHash,
  computeFullHash
};
