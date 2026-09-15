/**
 * @file hasher.js
 * @description Modulo per il calcolo crittografico e asincrono degli hash dei file.
 * Implementa una strategia a due stadi ad alte prestazioni:
 * 
 * 1. HASH DEL CHUNK INIZIALE (Partial Hash):
 *    Legge solo i primi N byte (default 1MB) del file per escludere file che hanno
 *    la stessa dimensione ma contenuti iniziali differenti, riducendo drasticamente
 *    le operazioni di I/O su dischi lenti o su file giganti.
 * 
 * 2. HASH COMPLETO (Full Hash):
 *    Viene calcolato solo e soltanto se i chunk iniziali coincidono, leggendo
 *    l'intero file tramite stream asincrono a blocchi per non saturare la memoria RAM.
 */

const fs = require('fs');
// Solo crypto nativo Node.js: nessun binario esterno per gli hash.
const crypto = require('crypto');
const { logger } = require('./logger');

/**
 * Dimensione predefinita del chunk iniziale per il pre-confronto rapido: 1 MegaByte (1024 * 1024 byte).
 * @constant {number}
 */
const DEFAULT_CHUNK_SIZE = 1024 * 1024;

/**
 * Calcola l'hash parziale dei primi byte di un file specificato.
 * 
 * @param {string} filePath - Percorso assoluto del file da analizzare
 * @param {string} [algorithm='sha256'] - Algoritmo crittografico da usare ('sha256' o 'md5')
 * @param {number} [chunkSize=DEFAULT_CHUNK_SIZE] - Numero di byte da leggere dalla testa del file
 * @returns {Promise<string>} Stringa esadecimale dell'hash calcolato
 */
async function computePartialHash(filePath, algorithm = 'sha256', chunkSize = DEFAULT_CHUNK_SIZE) {
  return new Promise((resolve, reject) => {
    try {
    logger.debug(`[Hasher] Inizio calcolo hash parziale (${algorithm}, chunk: ${chunkSize} byte) per: "${filePath}"`);
    
    // Validazione dell'algoritmo crittografico supportato (sha256 o md5 via crypto)
    const validAlgo = (algorithm.toLowerCase() === 'md5') ? 'md5' : 'sha256';
    const hash = crypto.createHash(validAlgo);

    // Apertura di uno stream limitato ai primi chunkSize byte (start 0, end chunkSize - 1)
    const stream = fs.createReadStream(filePath, { start: 0, end: chunkSize - 1 });

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      const digest = hash.digest('hex');
      logger.debug(`[Hasher] Hash parziale completato per "${filePath}": ${digest.substring(0, 16)}...`);
      resolve(digest);
    });

    stream.on('error', (err) => {
      // Traccia l'errore dettagliatamente per la diagnosi (es. permessi o file bloccato)
      logger.warn(`[Hasher] Errore lettura hash parziale per "${filePath}": [${err.code || 'UNKNOWN'}] ${err.message}`);
      reject(err);
    });
    } catch (err) {
      logger.warn(`[Hasher] computePartialHash interrotto per "${filePath}": ${err.message}`);
      reject(err);
    }
  });
}

/**
 * Calcola l'hash integrale dell'intero file tramite stream asincrono a blocchi da 64KB.
 * Questa funzione non carica mai l'intero file in memoria, consentendo l'hashing sicuro di file di qualsiasi dimensione (anche molti GB).
 * 
 * @param {string} filePath - Percorso assoluto del file da analizzare
 * @param {string} [algorithm='sha256'] - Algoritmo crittografico ('sha256' o 'md5')
 * @param {function(number): void} [onProgress] - Callback facoltativa che riceve il numero di byte letti finora
 * @returns {Promise<string>} Stringa esadecimale dell'hash completo
 */
async function computeFullHash(filePath, algorithm = 'sha256', onProgress = null) {
  return new Promise((resolve, reject) => {
    try {
    logger.debug(`[Hasher] Inizio calcolo hash COMPLETO (${algorithm}) per: "${filePath}"`);

    const validAlgo = (algorithm.toLowerCase() === 'md5') ? 'md5' : 'sha256';
    const hash = crypto.createHash(validAlgo);
    let bytesRead = 0;

    // Utilizziamo un buffer di lettura bilanciato da 64 KB (65536 byte)
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });

    stream.on('data', (chunk) => {
      hash.update(chunk);
      bytesRead += chunk.length;
      if (typeof onProgress === 'function') {
        onProgress(bytesRead);
      }
    });

    stream.on('end', () => {
      const digest = hash.digest('hex');
      logger.debug(`[Hasher] Hash COMPLETO calcolato per "${filePath}" (${bytesRead} byte): ${digest}`);
      resolve(digest);
    });

    stream.on('error', (err) => {
      logger.warn(`[Hasher] Errore calcolo hash completo per "${filePath}": [${err.code || 'UNKNOWN'}] ${err.message}`);
      reject(err);
    });
    } catch (err) {
      logger.warn(`[Hasher] computeFullHash interrotto per "${filePath}": ${err.message}`);
      reject(err);
    }
  });
}

module.exports = {
  DEFAULT_CHUNK_SIZE,
  computePartialHash,
  computeFullHash
};
