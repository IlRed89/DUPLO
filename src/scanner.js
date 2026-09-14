/**
 * @file scanner.js
 * @description Motore centrale di scansione ricorsiva per DupFinder.
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

/**
 * Normalizza un percorso di file o cartella per renderlo coerente su qualsiasi sistema operativo.
 * Risolve i separatori incongruenti ('/' vs '\') e converte il path in formato assoluto.
 * 
 * @param {string} rawPath - Percorso grezzo inserito dall'utente o dal sistema
 * @returns {string} Percorso assoluto e normalizzato
 */
function normalizeCrossPlatformPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return '';
  }
  // Normalizzazione tramite il modulo 'path' nativo del sistema ospite
  return path.resolve(path.normalize(rawPath.trim()));
}

/**
 * Struttura di dati per le opzioni di scansione configurate dall'utente.
 * @typedef {Object} ScanCriteria
 * @property {boolean} matchName - Se true, richiede che i file abbiano esattamente lo stesso nome
 * @property {boolean} matchSize - Se true, confronta la dimensione esatta in byte (raccomandato come primo filtro)
 * @property {boolean} matchDate - Se true, confronta la data di ultima modifica (mtime)
 * @property {boolean} matchHash - Se true, esegue il confronto crittografico dei contenuti a due stadi
 * @property {boolean} matchExtension - Se true, richiede che l'estensione sia identica (case-insensitive)
 * @property {string} hashAlgorithm - Algoritmo di hashing ('sha256' o 'md5')
 * @property {number} minSizeBytes - Dimensione minima in byte (i file più piccoli vengono ignorati)
 * @property {number} maxSizeBytes - Dimensione massima in byte (0 = senza limite)
 * @property {string[]} includeExtensions - Lista di estensioni da includere (es. ['.jpg', '.png'])
 * @property {string[]} excludeExtensions - Lista di estensioni da escludere (es. ['.tmp', '.log'])
 * @property {boolean} includeHidden - Se true, analizza anche file e cartelle nascoste (es. che iniziano con '.')
 */

/**
 * Controller di cancellazione per consentire l'interruzione immediata della scansione.
 */
class ScanCancellationToken {
  constructor() {
    this.isCancelled = false;
  }

  cancel() {
    this.isCancelled = true;
    logger.info('[Scanner] Richiesta di interruzione scansione ricevuta (CancellationToken)');
  }
}

/**
 * Esegue la scansione ricorsiva di una cartella collezionando tutti i file validi.
 * 
 * @param {string} dirPath - Percorso della directory da esplorare
 * @param {ScanCriteria} criteria - Criteri e filtri di ricerca
 * @param {ScanCancellationToken} token - Token per verificare se l'utente ha annullato l'operazione
 * @param {function(Object): void} onProgress - Callback per inviare aggiornamenti in tempo reale all'interfaccia
 * @param {Array<Object>} collectedFiles - Accumulatore interno dei file validi trovati
 */
async function walkDirectory(dirPath, criteria, token, onProgress, collectedFiles) {
  if (token && token.isCancelled) {
    return;
  }

  const normalizedDir = normalizeCrossPlatformPath(dirPath);
  logger.debug(`[Scanner] Esplorazione directory: "${normalizedDir}"`);

  let entries;
  try {
    // fs.readdir con withFileTypes: true evita chiamate separate di stat per scoprire se è directory
    entries = await fsp.readdir(normalizedDir, { withFileTypes: true });
  } catch (err) {
    // Gestione specifica degli errori di permesso cross-platform (EPERM, EACCES, EBUSY)
    logger.warn(`[Scanner] Impossibile leggere directory "${normalizedDir}": [${err.code || 'UNKNOWN'}] ${err.message}. La scansione prosegue sui percorsi accessibili.`);
    return;
  }

  for (const entry of entries) {
    if (token && token.isCancelled) {
      return;
    }

    const fullPath = path.join(normalizedDir, entry.name);

    // Gestione file e cartelle nascoste
    const isHidden = entry.name.startsWith('.');
    if (!criteria.includeHidden && isHidden) {
      logger.debug(`[Scanner] Ignorato elemento nascosto: "${fullPath}"`);
      continue;
    }

    if (entry.isDirectory()) {
      // Chiamata ricorsiva per le sotto-cartelle
      await walkDirectory(fullPath, criteria, token, onProgress, collectedFiles);
    } else if (entry.isFile()) {
      try {
        const stats = await fsp.stat(fullPath);
        const fileSize = stats.size;

        // Escludi file vuoti (0 byte) perché non ha senso confrontarli come duplicati di dati
        if (fileSize === 0) {
          continue;
        }

        // Filtro dimensione minima
        if (criteria.minSizeBytes > 0 && fileSize < criteria.minSizeBytes) {
          continue;
        }

        // Filtro dimensione massima (se impostata)
        if (criteria.maxSizeBytes > 0 && fileSize > criteria.maxSizeBytes) {
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();

        // Filtro estensioni incluse
        if (criteria.includeExtensions && criteria.includeExtensions.length > 0) {
          const matchInc = criteria.includeExtensions.some(e => e.toLowerCase() === ext || ('.' + e.toLowerCase()) === ext);
          if (!matchInc) continue;
        }

        // Filtro estensioni escluse
        if (criteria.excludeExtensions && criteria.excludeExtensions.length > 0) {
          const matchExc = criteria.excludeExtensions.some(e => e.toLowerCase() === ext || ('.' + e.toLowerCase()) === ext);
          if (matchExc) continue;
        }

        const fileRecord = {
          name: entry.name,
          extension: ext,
          path: fullPath,
          size: fileSize,
          mtimeMs: Math.floor(stats.mtimeMs),
          mtimeDate: stats.mtime.toISOString(),
          partialHash: null,
          fullHash: null
        };

        collectedFiles.push(fileRecord);

        // Notifica il progresso ogni 50 file analizzati per mantenere l'interfaccia reattiva
        if (collectedFiles.length % 10 === 0 && typeof onProgress === 'function') {
          onProgress({
            phase: 'collecting',
            currentFile: fullPath,
            filesCount: collectedFiles.length
          });
        }
      } catch (statErr) {
        // Ignora file lockati o con permessi negati senza arrestare la scansione globale
        logger.warn(`[Scanner] Errore lettura stat del file "${fullPath}": [${statErr.code || 'UNKNOWN'}] ${statErr.message}`);
      }
    }
  }
}

/**
 * Raggruppa i file in base ai criteri selezionati dall'utente (Nome, Dimensione, Data, Estensione, Hash).
 * 
 * @param {string[]} directories - Array delle cartelle selezionate dall'utente
 * @param {ScanCriteria} criteria - Parametri di confronto
 * @param {ScanCancellationToken} token - Token per l'annullamento della scansione
 * @param {function(Object): void} onProgress - Callback di aggiornamento stato per il renderer
 * @returns {Promise<Array<Object>>} Elenco dei gruppi di duplicati trovati
 */
async function findDuplicates(directories, criteria, token, onProgress) {
  logger.info('[Scanner] ================================================');
  logger.info(`[Scanner] Avvio scansione per duplicati su ${directories.length} cartelle`);
  logger.info(`[Scanner] Criteri attivi: ${JSON.stringify(criteria)}`);

  const startTime = Date.now();
  const allFiles = [];

  // FASE 1: Esplorazione cartelle
  for (const dir of directories) {
    if (token && token.isCancelled) break;
    await walkDirectory(dir, criteria, token, onProgress, allFiles);
  }

  if (token && token.isCancelled) {
    logger.info('[Scanner] Scansione interrotta durante la fase di raccolta file.');
    return [];
  }

  logger.info(`[Scanner] Raccolti ${allFiles.length} file candidati. Inizio raggruppamento per filtri preliminari.`);

  if (typeof onProgress === 'function') {
    onProgress({
      phase: 'grouping',
      filesCount: allFiles.length,
      currentFile: 'Raggruppamento preliminare...'
    });
  }

  // Costruiamo la chiave preliminare in base ai criteri selezionati
  // Se matchSize è attivo, raggruppiamo subito per dimensione (filtro più rapido ed efficiente)
  const initialBuckets = new Map();

  for (const file of allFiles) {
    const keyParts = [];

    if (criteria.matchSize) {
      keyParts.push(`size:${file.size}`);
    }
    if (criteria.matchName) {
      keyParts.push(`name:${file.name.toLowerCase()}`);
    }
    if (criteria.matchExtension) {
      keyParts.push(`ext:${file.extension.toLowerCase()}`);
    }
    if (criteria.matchDate) {
      // Arrotondamento al secondo per evitare discrepanze minime tra filesystem differenti (FAT vs NTFS vs EXT4)
      const secTimestamp = Math.floor(file.mtimeMs / 1000);
      keyParts.push(`date:${secTimestamp}`);
    }

    const compositeKey = keyParts.length > 0 ? keyParts.join('|') : `all`;

    if (!initialBuckets.has(compositeKey)) {
      initialBuckets.set(compositeKey, []);
    }
    initialBuckets.get(compositeKey).push(file);
  }

  // Filtra solo i bucket che contengono più di un file (candidati duplicati)
  let candidateBuckets = [];
  for (const [, files] of initialBuckets) {
    if (files.length > 1) {
      candidateBuckets.push(files);
    }
  }

  logger.info(`[Scanner] Individuati ${candidateBuckets.length} gruppi con potenziali duplicati.`);

  // Se l'utente non ha richiesto il controllo dell'hash, i bucket attuali sono già il risultato finale
  if (!criteria.matchHash) {
    const finalGroups = formatDuplicateGroups(candidateBuckets);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`[Scanner] Scansione completata in ${duration}s senza hashing. Trovati ${finalGroups.length} gruppi duplicati.`);
    return finalGroups;
  }

  // FASE 2: Confronto crittografico a due step (Partial Hash -> Full Hash)
  logger.info(`[Scanner] Inizio confronto crittografico a due step (Algoritmo: ${criteria.hashAlgorithm || 'sha256'}).`);

  const confirmedDuplicateGroups = [];
  let totalCandidatesToHash = 0;
  for (const bucket of candidateBuckets) {
    totalCandidatesToHash += bucket.length;
  }

  let hashedCount = 0;

  for (const bucket of candidateBuckets) {
    if (token && token.isCancelled) break;

    // STEP 2A: Hash del chunk iniziale (1MB) per ogni file del gruppo
    const partialHashBuckets = new Map();

    for (const file of bucket) {
      if (token && token.isCancelled) break;

      try {
        file.partialHash = await computePartialHash(file.path, criteria.hashAlgorithm);
        const pKey = file.partialHash;

        if (!partialHashBuckets.has(pKey)) {
          partialHashBuckets.set(pKey, []);
        }
        partialHashBuckets.get(pKey).push(file);
      } catch (err) {
        logger.warn(`[Scanner] Escluso file "${file.path}" per errore nel calcolo dell'hash parziale: ${err.message}`);
      }
    }

    // STEP 2B: Per ogni sotto-gruppo con partialHash identico, calcola il Full Hash
    for (const [, pFiles] of partialHashBuckets) {
      if (token && token.isCancelled) break;
      if (pFiles.length <= 1) {
        // Hash parziale univoco: non è un duplicato
        continue;
      }

      const fullHashBuckets = new Map();

      for (const file of pFiles) {
        if (token && token.isCancelled) break;

        hashedCount++;
        if (typeof onProgress === 'function') {
          onProgress({
            phase: 'hashing',
            filesCount: allFiles.length,
            hashedCount,
            totalToHash: totalCandidatesToHash,
            currentFile: file.path
          });
        }

        try {
          file.fullHash = await computeFullHash(file.path, criteria.hashAlgorithm);
          const fKey = file.fullHash;

          if (!fullHashBuckets.has(fKey)) {
            fullHashBuckets.set(fKey, []);
          }
          fullHashBuckets.get(fKey).push(file);
        } catch (err) {
          logger.warn(`[Scanner] Escluso file "${file.path}" per errore nel calcolo dell'hash completo: ${err.message}`);
        }
      }

      // Seleziona i gruppi dove il Full Hash è realmente identico per almeno 2 file
      for (const [, fFiles] of fullHashBuckets) {
        if (fFiles.length > 1) {
          confirmedDuplicateGroups.push(fFiles);
        }
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const finalGroups = formatDuplicateGroups(confirmedDuplicateGroups);
  logger.info(`[Scanner] Scansione terminata in ${duration}s. Rilevati ${finalGroups.length} gruppi duplicati confermati.`);

  return finalGroups;
}

/**
 * Struttura e formatta i gruppi di duplicati calcolando lo spazio sprecato.
 * 
 * @param {Array<Array<Object>>} rawGroups - Gruppi di file duplicati
 * @returns {Array<Object>} Gruppi arricchiti con statistiche (wastedBytes, count)
 */
function formatDuplicateGroups(rawGroups) {
  return rawGroups.map((files, index) => {
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
  }).sort((a, b) => b.wastedBytes - a.wastedBytes); // Ordina per spazio recuperabile decrescente
}

module.exports = {
  ScanCancellationToken,
  normalizeCrossPlatformPath,
  findDuplicates
};
