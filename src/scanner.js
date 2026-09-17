/**
 * @file scanner.js
 * @description Motore di scansione ricorsiva di DUPLO (Main Process, Node.js).
 *
 * Pipeline:
 * 1. Walk asincrono delle directory (`fs.promises.readdir` + `stat`).
 *    I filtri di dimensione / data / estensione scartano i file *durante* la
 *    raccolta, cosi non si accumula un inventario enorme di voci inutili.
 * 2. Raggruppamento preliminare (dimensione, nome, estensione, data, fuzzy).
 *    Subito dopo, l'array piatto `allFiles` viene svuotato: restano solo i
 *    bucket con 2 o piu candidati, che puntano agli stessi oggetti file.
 * 3. Hash a due step (opzionale): 1 MiB di testa, poi stream completo a 64 KiB.
 *
 * Path: `path.resolve` + `path.normalize` unifica separatori Windows e POSIX.
 * Permessi: EACCES/EPERM su una cartella non abortiscono la scansione.
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

async function walkDirectory(dirPath, criteria, token, onProgress, collectedFiles, skipStats) {
  if (token && token.isCancelled) {
    return;
  }
  const normalizedDir = normalizeCrossPlatformPath(dirPath);
  if (!normalizedDir) {
    logger.warn('[Scanner] Directory vuota ignorata durante il walk');
    return;
  }
  logger.debug('[Scanner] Esplorazione directory: "' + normalizedDir + '"');
  let entries;
  try {
    entries = await fsp.readdir(normalizedDir, { withFileTypes: true });
  } catch (err) {
    logger.warn('[Scanner] Impossibile leggere directory "' + normalizedDir + '": [' + (err.code || 'UNKNOWN') + '] ' + err.message + '. La scansione prosegue sui percorsi accessibili.');
    return;
  }
  for (const entry of entries) {
    if (token && token.isCancelled) {
      return;
    }
    const fullPath = path.join(normalizedDir, entry.name);
    const isHidden = entry.name.startsWith('.');
    if (!criteria.includeHidden && isHidden) {
      logger.debug('[Scanner] Ignorato elemento nascosto: "' + fullPath + '"');
      continue;
    }
    if (entry.isDirectory()) {
      await walkDirectory(fullPath, criteria, token, onProgress, collectedFiles, skipStats);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    try {
      const stats = await fsp.stat(fullPath);
      const fileSize = stats.size;
      if (fileSize === 0) {
        continue;
      }
      const minBytes = Number(criteria.minSizeBytes) || 0;
      const maxBytes = Number(criteria.maxSizeBytes) || 0;
      if (minBytes > 0 && fileSize < minBytes) {
        skipStats.tooSmall += 1;
        continue;
      }
      if (maxBytes > 0 && fileSize > maxBytes) {
        skipStats.tooLarge += 1;
        continue;
      }
      const afterMs = Number(criteria.modifiedAfterMs) || 0;
      const beforeMs = Number(criteria.modifiedBeforeMs) || 0;
      const mtimeMs = stats.mtimeMs;
      if (afterMs > 0 && mtimeMs < afterMs) {
        skipStats.tooOld += 1;
        continue;
      }
      if (beforeMs > 0 && mtimeMs > beforeMs) {
        skipStats.tooNew += 1;
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (criteria.includeExtensions && criteria.includeExtensions.length > 0) {
        if (!extensionMatches(ext, criteria.includeExtensions)) {
          skipStats.wrongExt += 1;
          continue;
        }
      }
      if (criteria.excludeExtensions && criteria.excludeExtensions.length > 0) {
        if (extensionMatches(ext, criteria.excludeExtensions)) {
          skipStats.wrongExt += 1;
          continue;
        }
      }
      collectedFiles.push({
        name: entry.name,
        extension: ext,
        path: fullPath,
        size: fileSize,
        mtimeMs: Math.floor(stats.mtimeMs),
        mtimeDate: stats.mtime.toISOString(),
        partialHash: null,
        fullHash: null
      });
      if (collectedFiles.length % 10 === 0 && typeof onProgress === 'function') {
        onProgress({ phase: 'collecting', currentFile: fullPath, filesCount: collectedFiles.length });
      }
    } catch (statErr) {
      logger.warn('[Scanner] Errore lettura stat del file "' + fullPath + '": [' + (statErr.code || 'UNKNOWN') + '] ' + statErr.message);
    }
  }
}
