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
 * Path: `path.resolve` + `path.normalize` unifica separatori Windows (`\`) e
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

/**
 * Normalizza un percorso utente in un path assoluto del sistema ospite.
 * Stringhe vuote/non-stringa → `''` (mai `undefined`) così i caller possono
 * rifiutare l'input a monte senza lanciare.
 *
 * @param {unknown} rawPath Percorso grezzo (dialogo nativo, drop, IPC).
 * @returns {string} Path assoluto normalizzato, oppure stringa vuota.
 */
function normalizeCrossPlatformPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return '';
  }
  const trimmed = rawPath.trim();
  // Solo spazi: `path.resolve('')` è la cwd e scansionerebbe l'app stessa.
  if (!trimmed) {
    return '';
  }
  return path.resolve(path.normalize(trimmed));
}

/**
 * Token cooperativo: il walk e l'hashing controllano `isCancelled` tra un
 * file e l'altro. Non è un AbortController: la Promise in corso termina
 * il chunk corrente e poi esce (così gli stream hash vengono chiusi).
 */
class ScanCancellationToken {
  constructor() {
    /** @type {boolean} */
    this.isCancelled = false;
  }

  /**
   * Segnala l'interruzione richiesta dall'utente (IPC `scan:cancel`).
   * @returns {void}
   */
  cancel() {
    this.isCancelled = true;
    logger.info('[Scanner] Richiesta di interruzione scansione ricevuta (CancellationToken)');
  }
}

/**
 * @typedef {Object} ScanCriteria
 * @property {boolean} [matchSize]
 * @property {boolean} [matchName]
 * @property {boolean} [matchExtension]
 * @property {boolean} [matchDate]
 * @property {boolean} [matchHash]
 * @property {boolean} [matchFuzzyName]
 * @property {string} [hashAlgorithm]
 * @property {number} [minSizeBytes]
 * @property {number} [maxSizeBytes]
 * @property {string[]} [includeExtensions]
 * @property {string[]} [excludeExtensions]
 * @property {boolean} [includeHidden]
 * @property {number} [modifiedAfterMs]
 * @property {number} [modifiedBeforeMs]
 */

/**
 * @typedef {Object} FileRecord
 * @property {string} name
 * @property {string} extension
 * @property {string} path
 * @property {number} size
 * @property {number} mtimeMs
 * @property {string} mtimeDate
 * @property {string|null} partialHash
 * @property {string|null} fullHash
 */

/**
 * @typedef {Object} SkipStats
 * @property {number} tooSmall
 * @property {number} tooLarge
 * @property {number} wrongExt
 * @property {number} tooOld
 * @property {number} tooNew
 */

/**
 * Confronta un'estensione file (es. `.jpg`) con una lista di filtri.
 * Accetta sia `.jpg` sia `jpg` perché l'UI e i test usano entrambi i formati.
 *
 * @param {string} ext Estensione del file, già in minuscolo e con il punto.
 * @param {string[]} list Elenco filtri.
 * @returns {boolean}
 */
function extensionMatches(ext, list) {
  if (!Array.isArray(list) || list.length === 0) {
    return false;
  }
  return list.some((item) => {
    const token = String(item || '').toLowerCase();
    return token === ext || ('.' + token) === ext;
  });
}

/**
 * Visita ricorsivamente una directory e accumula i file che superano i filtri.
 * Non mantiene metadati extra (inode, parent, albero): solo il record minimo
 * necessario al raggruppamento, per contenere la RAM prima degli hash.
 *
 * @param {string} dirPath Cartella da esplorare.
 * @param {ScanCriteria} criteria Filtri attivi.
 * @param {ScanCancellationToken|null} token Token di cancellazione.
 * @param {function(Object): void} [onProgress] Callback di progresso IPC.
 * @param {FileRecord[]} collectedFiles Array di output (mutato in-place).
 * @param {SkipStats} skipStats Contatori diagnostici (mutati in-place).
 * @returns {Promise<void>}
 */
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
    // withFileTypes evita uno stat extra per distinguere file/cartella.
    entries = await fsp.readdir(normalizedDir, { withFileTypes: true });
  } catch (err) {
    // EACCES/ENOENT: su Windows una cartella di sistema o un volume scollegato
    // non deve far fallire l'intera scansione.
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
      // Socket, FIFO, symlink non dereferenziati: non sono candidati duplicato.
      continue;
    }

    try {
      const stats = await fsp.stat(fullPath);
      const fileSize = stats.size;

      // 0 byte: identici tra loro ma inutili da segnalare come duplicati.
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

/**
 * Costruisce la chiave composita del bucket preliminare.
 * Solo i criteri *attivi* entrano nella chiave: se l'utente non chiede
 * "stesso nome", due file `foto.jpg` / `IMG_001.jpg` della stessa size
 * restano nello stesso bucket (e l'hash deciderà).
 *
 * @param {FileRecord} file
 * @param {ScanCriteria} criteria
 * @returns {string}
 */
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
    // Troncamento al secondo: FAT/exFAT e copie via USB arrotondano i ms.
    keyParts.push('date:' + Math.floor(file.mtimeMs / 1000));
  }
  const key = keyParts.length > 0 ? keyParts.join('|') : 'all';
  return key;
}

/**
 * Chiavi canoniche dei criteri (stesso vocabolario del Renderer / i18n).
 * L'ordine è quello di applicazione AND nella pipeline, con l'hash in coda
 * perché conferma i bucket già intersecati.
 * @type {readonly string[]}
 */
const CRITERION_ORDER = Object.freeze(['size', 'name', 'fuzzy', 'extension', 'date', 'hash']);

/**
 * Criteri di matching ammessi nel payload risultati.
 * @type {ReadonlySet<string>}
 */
const MATCH_REASONS = new Set(CRITERION_ORDER);

/**
 * Elenco esatto dei criteri AND che hanno prodotto il cluster.
 * Nessun fallback silenzioso su `size`: se l'utente ha spuntato solo
 * «Stessa estensione», l'array è `['extension']`.
 *
 * @param {ScanCriteria} criteria
 * @param {{ hashed?: boolean, fuzzyApplied?: boolean }} [flags]
 * @returns {string[]}
 */
function listMatchedCriteria(criteria, flags) {
  const opts = criteria && typeof criteria === 'object' ? criteria : {};
  const hashed = !!(flags && flags.hashed);
  const fuzzyApplied = !!(flags && flags.fuzzyApplied);
  /** @type {string[]} */
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

/**
 * Criterio "primario" per compatibilità (primo della lista AND).
 * Non inventa `size` se l'unico criterio è estensione/data/hash.
 *
 * @param {ScanCriteria} criteria
 * @param {{ hashed?: boolean, fuzzyApplied?: boolean }} [flags]
 * @returns {string}
 */
function classifyMatchReason(criteria, flags) {
  const list = listMatchedCriteria(criteria, flags);
  if (list.length === 0) {
    logger.warn('[Scanner] classifyMatchReason: nessun criterio attivo, uso "size" solo come chiave vuota');
    return 'size';
  }
  return list[0];
}

/**
 * Trasforma i bucket grezzi nel payload inviato al Renderer.
 * Ogni gruppo porta `matchedCriteria` (AND) e `matchReason` (primo della lista).
 *
 * @param {FileRecord[][]} rawGroups
 * @param {string[]} [matchedCriteria]
 * @returns {Array<{groupId: number, size: number, wastedBytes: number, fileCount: number, hash: string|null, matchReason: string, matchedCriteria: string[], files: FileRecord[]}>}
 */
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
  return rawGroups.map((files, index) => {
    const singleFileSize = files[0].size;
    const duplicateCount = files.length - 1;
    const wastedBytes = singleFileSize * duplicateCount;
    return {
      groupId: index + 1,
      size: singleFileSize,
      wastedBytes,
      fileCount: files.length,
      hash: files[0].fullHash || files[0].partialHash || null,
      matchReason: reason,
      matchedCriteria: list.slice(),
      files
    };
  }).sort((a, b) => b.wastedBytes - a.wastedBytes);
}

/**
 * Valida l'elenco di cartelle ricevuto via IPC.
 * Rifiuta input non-array / vuoti per non far partire un walk su `undefined`
 * (che in Node diventa `cwd` e scansionerebbe l'app stessa).
 *
 * @param {unknown} directories
 * @returns {string[]} Path normalizzati non vuoti.
 * @throws {Error} Se non resta nessuna cartella valida.
 */
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

/**
 * Trova i gruppi di file duplicati secondo i criteri dell'utente.
 *
 * @param {unknown} directories Elenco cartelle radice.
 * @param {ScanCriteria} [criteria]
 * @param {ScanCancellationToken|null} [token]
 * @param {function(Object): void} [onProgress]
 * @returns {Promise<Array<Object>>} Gruppi ordinati per spazio sprecato decrescente.
 * @throws {Error} Se `directories` è vuoto o non contiene path validi.
 */
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

  // I file isolati (nessun gemello su size/nome/…) non servono più.
  // Svuotare l'array piatto li rende raggiungibili solo se sono ancora in un bucket.
  allFiles.length = 0;
  initialBuckets.clear();

  let fuzzyApplied = false;
  if (opts.matchFuzzyName && !opts.matchName) {
    // Fuzzy: Levenshtein + Dice + stem senza parentesi, soglia 0.80.
    // Si applica *dentro* i bucket già ristretti (non O(n²) su tutta la raccolta).
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

  // Step 1: hash dei primi 1 MiB. File della stessa size con testa diversa
  // escono qui, senza leggere i GB restanti.
  // Step 2: solo i collidenti sullo step 1 fanno lo stream completo (64 KiB).
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
  MATCH_REASONS,
  CRITERION_ORDER
};
