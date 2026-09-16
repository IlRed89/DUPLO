/**
 * @file scanner.js
 * @description Motore centrale di scansione ricorsiva per DUPLO.
 * Naviga l'albero delle directory in modo asincrono e sicuro, gestendo i permessi del sistema operativo,
 * normalizzando i percorsi cross-platform (Windows, macOS, Linux) e applicando i filtri di confronto configurati dall'utente:
 * 
 * 1. Filtro rapido per dimensione file
 * 2. Filtro per nome esatto del file
 * 3. Filtro per estensione
 * 4. Filtro per data di ultima modifica (timestamp)
 * 5. Filtro per contenuto tramite hash a due step (chunk 1MB iniziale + hash integrale)
 */

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
  return path.resolve(path.normalize(rawPath.trim()));
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

async function walkDirectory(dirPath, criteria, token, onProgress, collectedFiles, skipStats) {
  if (token && token.isCancelled) {
    return;
  }
  const normalizedDir = normalizeCrossPlatformPath(dirPath);
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
    } else if (entry.isFile()) {
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
          logger.debug('[Scanner] Scartato (dimensione < min ' + minBytes + ' B): "' + fullPath + '" size=' + fileSize);
          continue;
        }
        if (maxBytes > 0 && fileSize > maxBytes) {
          skipStats.tooLarge += 1;
          logger.debug('[Scanner] Scartato (dimensione > max ' + maxBytes + ' B): "' + fullPath + '" size=' + fileSize);
          continue;
        }
        const afterMs = Number(criteria.modifiedAfterMs) || 0;
        const beforeMs = Number(criteria.modifiedBeforeMs) || 0;
        const mtimeMs = stats.mtimeMs;
        if (afterMs > 0 && mtimeMs < afterMs) {
          skipStats.tooOld += 1;
          logger.debug('[Scanner] Scartato (mtime troppo vecchio): "' + fullPath + '"');
          continue;
        }
        if (beforeMs > 0 && mtimeMs > beforeMs) {
          skipStats.tooNew += 1;
          logger.debug('[Scanner] Scartato (mtime troppo recente): "' + fullPath + '"');
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (criteria.includeExtensions && criteria.includeExtensions.length > 0) {
          const matchInc = criteria.includeExtensions.some(function(e) {
            return e.toLowerCase() === ext || ('.' + e.toLowerCase()) === ext;
          });
          if (!matchInc) {
            skipStats.wrongExt += 1;
            continue;
          }
        }
        if (criteria.excludeExtensions && criteria.excludeExtensions.length > 0) {
          const matchExc = criteria.excludeExtensions.some(function(e) {
            return e.toLowerCase() === ext || ('.' + e.toLowerCase()) === ext;
          });
          if (matchExc) {
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
}

async function findDuplicates(directories, criteria, token, onProgress) {
  logger.info('[Scanner] ================================================');
  logger.info('[Scanner] Avvio scansione per duplicati su ' + directories.length + ' cartelle');
  logger.info('[Scanner] Criteri attivi: ' + JSON.stringify(criteria));
  const startTime = Date.now();
  const allFiles = [];
  const skipStats = { tooSmall: 0, tooLarge: 0, wrongExt: 0, tooOld: 0, tooNew: 0 };
  for (const dir of directories) {
    if (token && token.isCancelled) break;
    await walkDirectory(dir, criteria, token, onProgress, allFiles, skipStats);
  }
  logger.info('[Scanner] File scartati dai filtri avanzati: ' + JSON.stringify(skipStats));
  if (token && token.isCancelled) {
    logger.info('[Scanner] Scansione interrotta durante la fase di raccolta file.');
    return [];
  }
  logger.info('[Scanner] Raccolti ' + allFiles.length + ' file candidati. Inizio raggruppamento per filtri preliminari.');
  if (typeof onProgress === 'function') {
    onProgress({ phase: 'grouping', filesCount: allFiles.length, currentFile: 'Raggruppamento preliminare...' });
  }
  const initialBuckets = new Map();
  for (const file of allFiles) {
    const keyParts = [];
    if (criteria.matchSize) keyParts.push('size:' + file.size);
    if (criteria.matchName) keyParts.push('name:' + file.name.toLowerCase());
    if (criteria.matchExtension) keyParts.push('ext:' + file.extension.toLowerCase());
    if (criteria.matchDate) keyParts.push('date:' + Math.floor(file.mtimeMs / 1000));
    const compositeKey = keyParts.length > 0 ? keyParts.join('|') : 'all';
    if (!initialBuckets.has(compositeKey)) initialBuckets.set(compositeKey, []);
    initialBuckets.get(compositeKey).push(file);
  }
  let candidateBuckets = [];
  for (const entry of initialBuckets) {
    if (entry[1].length > 1) candidateBuckets.push(entry[1]);
  }
  if (criteria.matchFuzzyName && !criteria.matchName) {
    logger.info('[Scanner] Fuzzy name attivo (soglia ' + FUZZY_NAME_THRESHOLD + '). Spezzo i bucket per similarita.');
    const fuzzyBuckets = [];
    for (let b = 0; b < candidateBuckets.length; b += 1) {
      if (token && token.isCancelled) break;
      const clustered = clusterByFuzzyName(candidateBuckets[b], FUZZY_NAME_THRESHOLD);
      for (let c = 0; c < clustered.length; c += 1) fuzzyBuckets.push(clustered[c]);
    }
    logger.info('[Scanner] Fuzzy: ' + candidateBuckets.length + ' bucket -> ' + fuzzyBuckets.length + ' cluster');
    candidateBuckets = fuzzyBuckets;
  } else if (criteria.matchFuzzyName && criteria.matchName) {
    logger.warn('[Scanner] Nomi Simili ignorato: e attivo anche Stesso Nome File (confronto esatto)');
  }
  logger.info('[Scanner] Individuati ' + candidateBuckets.length + ' gruppi con potenziali duplicati.');
  if (!criteria.matchHash) {
    const finalGroups = formatDuplicateGroups(candidateBuckets);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('[Scanner] Scansione completata in ' + duration + 's senza hashing. Trovati ' + finalGroups.length + ' gruppi duplicati.');
    return finalGroups;
  }
  logger.info('[Scanner] Inizio confronto crittografico a due step (Algoritmo: ' + (criteria.hashAlgorithm || 'sha256') + ').');
  const confirmedDuplicateGroups = [];
  let totalCandidatesToHash = 0;
  for (const bucket of candidateBuckets) totalCandidatesToHash += bucket.length;
  let hashedCount = 0;
  for (const bucket of candidateBuckets) {
    if (token && token.isCancelled) break;
    const partialHashBuckets = new Map();
    for (const file of bucket) {
      if (token && token.isCancelled) break;
      try {
        file.partialHash = await computePartialHash(file.path, criteria.hashAlgorithm);
        const pKey = file.partialHash;
        if (!partialHashBuckets.has(pKey)) partialHashBuckets.set(pKey, []);
        partialHashBuckets.get(pKey).push(file);
      } catch (err) {
        logger.warn('[Scanner] Escluso file "' + file.path + '" per errore nel calcolo dell hash parziale: ' + err.message);
      }
    }
    for (const pEntry of partialHashBuckets) {
      const pFiles = pEntry[1];
      if (token && token.isCancelled) break;
      if (pFiles.length <= 1) continue;
      const fullHashBuckets = new Map();
      for (const file of pFiles) {
        if (token && token.isCancelled) break;
        hashedCount++;
        if (typeof onProgress === 'function') {
          onProgress({ phase: 'hashing', filesCount: allFiles.length, hashedCount: hashedCount, totalToHash: totalCandidatesToHash, currentFile: file.path });
        }
        try {
          file.fullHash = await computeFullHash(file.path, criteria.hashAlgorithm);
          const fKey = file.fullHash;
          if (!fullHashBuckets.has(fKey)) fullHashBuckets.set(fKey, []);
          fullHashBuckets.get(fKey).push(file);
        } catch (err) {
          logger.warn('[Scanner] Escluso file "' + file.path + '" per errore nel calcolo dell hash completo: ' + err.message);
        }
      }
      for (const fEntry of fullHashBuckets) {
        if (fEntry[1].length > 1) confirmedDuplicateGroups.push(fEntry[1]);
      }
    }
  }
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const finalGroups = formatDuplicateGroups(confirmedDuplicateGroups);
  logger.info('[Scanner] Scansione terminata in ' + duration + 's. Rilevati ' + finalGroups.length + ' gruppi duplicati confermati.');
  return finalGroups;
}

function formatDuplicateGroups(rawGroups) {
  return rawGroups.map(function(files, index) {
    const singleFileSize = files[0].size;
    const duplicateCount = files.length - 1;
    const wastedBytes = singleFileSize * duplicateCount;
    return {
      groupId: index + 1,
      size: singleFileSize,
      wastedBytes: wastedBytes,
      fileCount: files.length,
      hash: files[0].fullHash || files[0].partialHash || null,
      files: files
    };
  }).sort(function(a, b) { return b.wastedBytes - a.wastedBytes; });
}

module.exports = {
  ScanCancellationToken: ScanCancellationToken,
  normalizeCrossPlatformPath: normalizeCrossPlatformPath,
  findDuplicates: findDuplicates
};
