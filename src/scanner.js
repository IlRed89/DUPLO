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

    logger.warn(
      '[Scanner] Impossibile leggere directory "' + normalizedDir + '": [' +
      (err.code || 'UNKNOWN') + '] ' + err.message +
      '. La scansione prosegue sui percorsi accessibili.'
    );
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
        onProgress({
          phase: 'collecting',
          currentFile: fullPath,
          filesCount: collectedFiles.length
        });
      }
    } catch (statErr) {
      logger.warn(
        '[Scanner] Errore lettura stat del file "' + fullPath + '": [' +
        (statErr.code || 'UNKNOWN') + '] ' + statErr.message
      );
    }
  }
}

function buildBucketKey(file, criteria) {
  const keyParts = [];
  if (criteria.matchSize) {
    keyParts.push('size:' + file.size);
  }
  if (criteria.matchName) {
    keyParts.push('name:' + file.name.toLowerCase());
  }
  if (criteria.matchExtension) {
    keyParts.push('ext:' + file.extension.toLowerCase());
  }
  if (criteria.matchDate) {

    keyParts.push('date:' + Math.floor(file.mtimeMs / 1000));
  }
  const key = keyParts.length > 0 ? keyParts.join('|') : 'all';
  return key;
}

const CRITERION_ORDER = Object.freeze(['size', 'name', 'fuzzy', 'extension', 'date', 'hash']);

const MATCH_REASONS = new Set(CRITERION_ORDER);

function listMatchedCriteria(criteria, flags) {
  const opts = criteria && typeof criteria === 'object' ? criteria : {};
  const hashed = !!(flags && flags.hashed);
  const fuzzyApplied = !!(flags && flags.fuzzyApplied);

  const applied = [];
  if (opts.matchSize) {
    applied.push('size');
  }
  if (opts.matchName) {
    applied.push('name');
  }
  if (fuzzyApplied) {
    applied.push('fuzzy');
  }
  if (opts.matchExtension) {
    applied.push('extension');
  }
  if (opts.matchDate) {
    applied.push('date');
  }
  if (hashed) {
    applied.push('hash');
  }
  logger.info('[Scanner] matchedCriteria AND = [' + applied.join(', ') + ']');
  return applied;
}

function classifyMatchReason(criteria, flags) {
  const list = listMatchedCriteria(criteria, flags);
  if (list.length === 0) {
    logger.warn('[Scanner] classifyMatchReason: nessun criterio attivo, uso "size" solo come chiave vuota');
    return 'size';
  }
  return list[0];
}

function sortFilesInGroup(files) {
  return (files || []).slice().sort(function (a, b) {
    const ta = Number(a && a.mtimeMs) || 0;
    const tb = Number(b && b.mtimeMs) || 0;
    if (ta !== tb) {
      return ta - tb;
    }
    const pa = String((a && a.path) || '');
    const pb = String((b && b.path) || '');
    return pa.localeCompare(pb, undefined, { sensitivity: 'base' });
  });
}

function orderResultGroups(groups) {
  const ordered = (groups || []).slice().sort(function (a, b) {
    const sa = Number(a && a.size) || 0;
    const sb = Number(b && b.size) || 0;
    if (sb !== sa) {
      return sb - sa;
    }
    const na = String((a && a.files && a.files[0] && (a.files[0].name || a.files[0].path)) || '');
    const nb = String((b && b.files && b.files[0] && (b.files[0].name || b.files[0].path)) || '');
    return na.localeCompare(nb, undefined, { sensitivity: 'base' });
  });
  ordered.forEach(function (group, index) {
    group.files = sortFilesInGroup(group.files || []);
    group.fileCount = group.files.length;
    group.groupId = index + 1;
    const fileSize = group.files[0] ? group.files[0].size : (group.size || 0);
    group.size = fileSize;
    group.wastedBytes = fileSize * Math.max(0, group.files.length - 1);
  });
  logger.info('[Scanner] orderResultGroups: ' + ordered.length + ' gruppi, size desc + groupId sequenziale');
  return ordered;
}

function formatDuplicateGroups(rawGroups, matchedCriteria) {
  const list = Array.isArray(matchedCriteria)
    ? matchedCriteria.filter(function (key) {
      return MATCH_REASONS.has(key);
    })
    : [];
  const reason = list[0] || 'size';
  logger.info(
    '[Scanner] formatDuplicateGroups: ' + rawGroups.length +
    ' cluster, matchReason=' + reason +
    ', matchedCriteria=[' + list.join(', ') + ']'
  );
  const mapped = (rawGroups || []).map(function (files) {
    const sorted = sortFilesInGroup(files);
    const first = sorted[0] || {};
    const singleFileSize = Number(first.size) || 0;
    return {
      groupId: 0,
      size: singleFileSize,
      wastedBytes: singleFileSize * Math.max(0, sorted.length - 1),
      fileCount: sorted.length,
      hash: first.fullHash || first.partialHash || null,
      matchReason: reason,
      matchedCriteria: list.slice(),
      files: sorted
    };
  });
  return orderResultGroups(mapped);
}

function normalizeScanDirectories(directories) {
  if (!Array.isArray(directories) || directories.length === 0) {
    throw new Error('Specificare almeno una cartella da scansionare');
  }
  const normalized = [];
  const seen = new Set();
  for (const raw of directories) {
    const dir = normalizeCrossPlatformPath(String(raw || ''));
    if (!dir || seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    normalized.push(dir);
  }
  if (normalized.length === 0) {
    throw new Error('Nessun percorso cartella valido da scansionare');
  }
  return normalized;
}

async function findDuplicates(directories, criteria, token, onProgress) {
  const roots = normalizeScanDirectories(directories);
  const opts = criteria && typeof criteria === 'object' ? criteria : {};

  logger.info('[Scanner] ================================================');
  logger.info('[Scanner] Avvio scansione per duplicati su ' + roots.length + ' cartelle');
  logger.info('[Scanner] Criteri attivi: ' + JSON.stringify(opts));

  const startTime = Date.now();
  const allFiles = [];
  const skipStats = { tooSmall: 0, tooLarge: 0, wrongExt: 0, tooOld: 0, tooNew: 0 };

  for (const dir of roots) {
    if (token && token.isCancelled) {
      break;
    }
    await walkDirectory(dir, opts, token, onProgress, allFiles, skipStats);
  }

  logger.info('[Scanner] File scartati dai filtri avanzati: ' + JSON.stringify(skipStats));

  if (token && token.isCancelled) {
    logger.info('[Scanner] Scansione interrotta durante la fase di raccolta file.');
    allFiles.length = 0;
    return [];
  }

  const collectedCount = allFiles.length;
  logger.info('[Scanner] Raccolti ' + collectedCount + ' file candidati. Inizio raggruppamento per filtri preliminari.');

  if (typeof onProgress === 'function') {
    onProgress({
      phase: 'grouping',
      filesCount: collectedCount,
      currentFile: 'Raggruppamento preliminare...'
    });
  }

  const initialBuckets = new Map();
  for (const file of allFiles) {
    const compositeKey = buildBucketKey(file, opts);
    if (!initialBuckets.has(compositeKey)) {
      initialBuckets.set(compositeKey, []);
    }
    initialBuckets.get(compositeKey).push(file);
  }

  let candidateBuckets = [];
  for (const bucket of initialBuckets.values()) {
    if (bucket.length > 1) {
      candidateBuckets.push(bucket);
    }
  }

  allFiles.length = 0;
  initialBuckets.clear();

  let fuzzyApplied = false;
  if (opts.matchFuzzyName && !opts.matchName) {

    logger.info('[Scanner] Fuzzy name attivo (soglia ' + FUZZY_NAME_THRESHOLD + '). Spezzo i bucket per similarita.');
    const fuzzyBuckets = [];
    for (let b = 0; b < candidateBuckets.length; b += 1) {
      if (token && token.isCancelled) {
        break;
      }
      const clustered = clusterByFuzzyName(candidateBuckets[b], FUZZY_NAME_THRESHOLD);
      for (let c = 0; c < clustered.length; c += 1) {
        fuzzyBuckets.push(clustered[c]);
      }
    }
    logger.info('[Scanner] Fuzzy: ' + candidateBuckets.length + ' bucket -> ' + fuzzyBuckets.length + ' cluster');
    candidateBuckets = fuzzyBuckets;
    fuzzyApplied = true;
  } else if (opts.matchFuzzyName && opts.matchName) {
    logger.warn('[Scanner] Nomi Simili ignorato: e attivo anche Stesso Nome File (confronto esatto)');
  }

  logger.info('[Scanner] Individuati ' + candidateBuckets.length + ' gruppi con potenziali duplicati.');

  if (!opts.matchHash) {
    const matchedCriteria = listMatchedCriteria(opts, { hashed: false, fuzzyApplied });
    logger.info('[Scanner] Cluster senza hashing. AND = [' + matchedCriteria.join(', ') + ']');
    const finalGroups = formatDuplicateGroups(candidateBuckets, matchedCriteria);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('[Scanner] Scansione completata in ' + duration + 's senza hashing. Trovati ' + finalGroups.length + ' gruppi duplicati.');
    return finalGroups;
  }

  logger.info('[Scanner] Inizio confronto crittografico a due step (Algoritmo: ' + (opts.hashAlgorithm || 'sha256') + ').');

  const confirmedDuplicateGroups = [];
  let totalCandidatesToHash = 0;
  for (const bucket of candidateBuckets) {
    totalCandidatesToHash += bucket.length;
  }
  let hashedCount = 0;

  for (const bucket of candidateBuckets) {
    if (token && token.isCancelled) {
      break;
    }

    const partialHashBuckets = new Map();
    for (const file of bucket) {
      if (token && token.isCancelled) {
        break;
      }
      try {
        file.partialHash = await computePartialHash(file.path, opts.hashAlgorithm);
        const pKey = file.partialHash;
        if (!partialHashBuckets.has(pKey)) {
          partialHashBuckets.set(pKey, []);
        }
        partialHashBuckets.get(pKey).push(file);
      } catch (err) {
        logger.warn('[Scanner] Escluso file "' + file.path + '" per errore nel calcolo dell hash parziale: ' + err.message);
      }
    }

    for (const pFiles of partialHashBuckets.values()) {
      if (token && token.isCancelled) {
        break;
      }
      if (pFiles.length <= 1) {
        continue;
      }

      const fullHashBuckets = new Map();
      for (const file of pFiles) {
        if (token && token.isCancelled) {
          break;
        }
        hashedCount += 1;
        if (typeof onProgress === 'function') {
          onProgress({
            phase: 'hashing',
            filesCount: collectedCount,
            hashedCount,
            totalToHash: totalCandidatesToHash,
            currentFile: file.path
          });
        }
        try {
          file.fullHash = await computeFullHash(file.path, opts.hashAlgorithm);
          const fKey = file.fullHash;
          if (!fullHashBuckets.has(fKey)) {
            fullHashBuckets.set(fKey, []);
          }
          fullHashBuckets.get(fKey).push(file);
        } catch (err) {
          logger.warn('[Scanner] Escluso file "' + file.path + '" per errore nel calcolo dell hash completo: ' + err.message);
        }
      }

      for (const fFiles of fullHashBuckets.values()) {
        if (fFiles.length > 1) {
          confirmedDuplicateGroups.push(fFiles);
        }
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const matchedCriteria = listMatchedCriteria(opts, { hashed: true, fuzzyApplied });
  logger.info('[Scanner] Cluster confermati da hash. AND = [' + matchedCriteria.join(', ') + ']');
  const finalGroups = formatDuplicateGroups(confirmedDuplicateGroups, matchedCriteria);
  logger.info('[Scanner] Scansione terminata in ' + duration + 's. Rilevati ' + finalGroups.length + ' gruppi duplicati confermati.');
  return finalGroups;
}

module.exports = {
  ScanCancellationToken,
  normalizeCrossPlatformPath,
  findDuplicates,
  classifyMatchReason,
  listMatchedCriteria,
  formatDuplicateGroups,
  sortFilesInGroup,
  orderResultGroups,
  MATCH_REASONS,
  CRITERION_ORDER
};
