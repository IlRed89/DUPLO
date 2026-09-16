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

/**
 * Normalizza un percorso di file o cartella per renderlo coerente su qualsiasi sistema operativo.
 * Risolve i separatori incongruenti ('/' vs '\\') e converte il path in formato assoluto.
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
 * @property {boolean} matchFuzzyName - Se true, raggruppa nomi con similarità ≥ 80% (Levenshtein/Dice)
 * @property {boolean} matchSize - Se true, confronta la dimensione esatta in byte (raccomandato come primo filtro)
 * @property {boolean} matchDate - Se true, confronta la data di ultima modifica (mtime)
 * @property {boolean} matchHash - Se true, esegue il confronto crittografico dei contenuti a due stadi
 * @property {boolean} matchExtension - Se true, richiede che l'estensione sia identica (case-insensitive)
 * @property {string} hashAlgorithm - Algoritmo di hashing ('sha256' o 'md5')
 * @property {number} minSizeBytes - Dimensione minima in byte (i file più piccoli vengono ignorati)
 * @property {number} maxSizeBytes - Dimensione massima in byte (0 = senza limite)
 * @property {string[]} includeExtensions - Lista di estensioni da includere (es. ['.jpg', '.png'])
 * @property {string[]} customExtensions - Estensioni digitare in Ricerca Avanzata (hanno priorità sulla categoria)
 * @property {string[]} excludeExtensions - Lista di estensioni da escludere (es. ['.tmp', '.log'])
 * @property {boolean} includeHidden - Se true, analizza anche file e cartelle nascoste (es. che iniziano con '.')
 * @property {number} [modifiedAfterMs] - mtime minimo (epoch ms, 0 = nessun limite inferiore)
 * @property {number} [modifiedBeforeMs] - mtime massimo (epoch ms, 0 = nessun limite superiore)
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
