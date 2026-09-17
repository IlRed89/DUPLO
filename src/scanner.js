/**
 * @file scanner.js
 * @description Motore di scansione ricorsiva di DUPLO (Main Process, Node.js).
 *
 * Pipeline:
 * 1. Walk asincrono delle directory (`fs.promises.readdir` + `stat`).
 *    I filtri di dimensione / data / estensione scartano i file *durante* la
 *    raccolta, così non si accumula un inventario enorme di voci inutili.
 * 2. Raggruppamento preliminare (dimensione, nome, estensione, data, fuzzy).
 *    Subito dopo, l'array piatto `allFiles` viene svuotato: restano solo i
 *    bucket con ≥ 2 candidati, che puntano agli stessi oggetti file.
 * 3. Hash a due step (opzionale): 1 MiB di testa, poi stream completo a 64 KiB.
 *
 * Path: `path.resolve` + `path.normalize` unifica separatori Windows (`\\`) e
 * POSIX (`/`). Permessi: EACCES/EPERM su una cartella non abortiscono la
 * scansione — si logga e si prosegue sulle voci accessibili.
 */

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { logger } = require('./logger');
const { computePartialHash, computeFullHash } = require('./hasher');
const { clusterByFuzzyName, FUZZY_NAME_THRESHOLD } = require('./fuzzyName');

function normalizeCrossPlatformPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return '';
  }
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return '';
  }
  return path.resolve(path.normalize(trimmed));
}

class ScanCancellationToken {
  constructor() {
    this.isCancelled = false;
  }
  cancel() {
    this.isCancelled = true;
    logger.info('[Scanner] Richiesta di interruzione scansione ricevuta (CancellationToken)');
  }
}

function extensionMatches(ext, list) {
  if (!Array.isArray(list) || list.length === 0) {
    return false;
  }
  return list.some((item) => {
    const token = String(item || '').toLowerCase();
    return token === ext || ('.' + token) === ext;
  });
}
