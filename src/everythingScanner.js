/**
 * @file everythingScanner.js
 * @description Modulo di integrazione con il motore Everything (Voidtools) per Windows.
 *
 * Supporta sia:
 * 1. Istanza di sistema esistente (Everything già avviato dall'utente).
 * 2. Istanza embedded / portatile inclusa (`bin/win/Everything.exe`):
 *    Se Everything non è in esecuzione, DUPLO avvia in background la propria istanza portatile
 *    silenziosa, garantendo l'indicizzazione MFT NTFS a qualsiasi utente su Windows senza installazione.
 *
 * Al termine della sessione DUPLO termina l'istanza embedded senza lasciare processi orfani.
 * Se si è su Linux o l'indice non risponde, si effettua fallback trasparente sullo scanner standard.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const readline = require('readline');
const { logger } = require('./logger');

/** @type {import('child_process').ChildProcess|null} Processo Everything avviato da DUPLO */
let embeddedProcess = null;

/**
 * Risolve il percorso dell'eseguibile `es.exe` (client CLI) incluso nell'applicazione.
 *
 * @returns {string|null} Percorso assoluto di `es.exe` se presente su Windows, altrimenti null.
 */
function getEsBinaryPath() {
  if (process.platform !== 'win32') {
    return null;
  }

  // 1. Percorso locale o in sviluppo (DUPLO/bin/win/es.exe)
  const localBin = path.join(__dirname, '..', 'bin', 'win', 'es.exe');
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  // 2. Nel pacchetto asar/resources (process.resourcesPath/bin/win/es.exe)
  if (typeof process.resourcesPath === 'string') {
    const packagedBin = path.join(process.resourcesPath, 'bin', 'win', 'es.exe');
    if (fs.existsSync(packagedBin)) {
      return packagedBin;
    }
  }

  return null;
}

/**
 * Risolve il percorso dell'eseguibile `Everything.exe` (motore portable) incluso nell'applicazione.
 *
 * @returns {string|null} Percorso assoluto di `Everything.exe` se presente, altrimenti null.
 */
function getEverythingEnginePath() {
  if (process.platform !== 'win32') {
    return null;
  }

  const localEngine = path.join(__dirname, '..', 'bin', 'win', 'Everything.exe');
  if (fs.existsSync(localEngine)) {
    return localEngine;
  }

  if (typeof process.resourcesPath === 'string') {
    const packagedEngine = path.join(process.resourcesPath, 'bin', 'win', 'Everything.exe');
    if (fs.existsSync(packagedEngine)) {
      return packagedEngine;
    }
  }

  return null;
}

/**
 * Verifica in modo non bloccante se un'istanza di Everything è attualmente in esecuzione e risponde su IPC.
 *
 * @param {string} [esPath] Percorso opzionale di es.exe.
 * @returns {Promise<boolean>} True se Everything è attivo e pronto a rispondere.
 */
function isEverythingRunning(esPath) {
  const binary = esPath || getEsBinaryPath();
  if (!binary) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    execFile(binary, ['-get-everything-version'], { timeout: 1500, windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }
      const version = String(stdout || '').trim();
      const isOk = version.length > 0 && !version.toLowerCase().includes('error');
      if (isOk) {
        logger.info(`[Everything] Rilevato Everything attivo (Versione: ${version})`);
      }
      resolve(isOk);
    });
  });
}

/**
 * Assicura che un'istanza di Everything sia disponibile e attiva.
 * Se non è già in esecuzione, avvia silenziosamente l'eseguibile portatile incluso in `bin/win/`.
 *
 * @returns {Promise<boolean>} True se il motore è pronto.
 */
async function ensureEverythingEngine() {
  if (process.platform !== 'win32') {
    return false;
  }

  // 1. Controlla se Everything è già in esecuzione (installazione utente o istanza già avviata)
  const running = await isEverythingRunning();
  if (running) {
    return true;
  }

  // 2. Se non è in esecuzione, avvia il motore portatile integrato
  const enginePath = getEverythingEnginePath();
  if (!enginePath) {
    logger.warn('[Everything] Motore Everything.exe portatile non trovato');
    return false;
  }

  try {
    logger.info(`[Everything] Avvio del motore portatile integrato: "${enginePath}"`);
    // -startup: avvia minimizzato/in background senza aprire finestra UI principale
    // -read-only: non scrive associazioni nel registro
    embeddedProcess = spawn(enginePath, ['-startup', '-read-only'], {
      detached: false,
      windowsHide: true,
      stdio: 'ignore'
    });

    embeddedProcess.on('error', (err) => {
      logger.warn(`[Everything] Errore spawn motore Everything: ${err.message}`);
      embeddedProcess = null;
    });

    // Attendi fino a 2.5 secondi che il motore inizializzi l'IPC
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      const ok = await isEverythingRunning();
      if (ok) {
        logger.info('[Everything] Motore portatile avviato e connesso con successo!');
        return true;
      }
    }
  } catch (err) {
    logger.warn(`[Everything] Impossibile avviare Everything embedded: ${err.message}`);
  }

  return false;
}

/**
 * Arresta in modo pulito l'istanza portatile di Everything se avviata da DUPLO.
 *
 * @returns {void}
 */
function stopEmbeddedEverything() {
  if (embeddedProcess) {
    try {
      logger.info('[Everything] Chiusura del motore Everything embedded avviato da DUPLO');
      const esPath = getEsBinaryPath();
      if (esPath) {
        // Invia comando ufficiale -exit a Everything
        execFile(esPath, ['-exit'], { timeout: 1000, windowsHide: true }, () => {});
      }
      embeddedProcess.kill();
    } catch (_err) {}
    embeddedProcess = null;
  }
}

/**
 * Esegue la scansione ultra-rapida tramite Everything per una cartella specifica.
 *
 * @param {string} directory Cartella da scansionare.
 * @param {Object} criteria Criteri di filtraggio (dimensioni, date, estensioni, nascosti).
 * @param {import('./scanner').ScanCancellationToken|null} token
 * @param {function(Object): void} [onProgress]
 * @param {Array<Object>} collectedFiles Accumulatore dei file.
 * @param {Object} skipStats Statistiche sui file scartati.
 * @returns {Promise<boolean>} True se la scansione Everything è riuscita, false se serve fallback.
 */
function walkWithEverything(directory, criteria, token, onProgress, collectedFiles, skipStats) {
  const binary = getEsBinaryPath();
  if (!binary) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const args = [
      '-path', directory,
      '/a-d',
      '-csv',
      '-size',
      '-date-modified',
      '-date-format', '1',
      '-size-format', '1'
    ];

    let child;
    try {
      child = spawn(binary, args, { windowsHide: true });
    } catch (spawnErr) {
      logger.warn(`[Everything] Impossibile avviare es.exe: ${spawnErr.message}`);
      resolve(false);
      return;
    }

    let isHeader = true;
    let failed = false;

    child.on('error', (err) => {
      logger.warn(`[Everything] Errore processo es.exe: ${err.message}`);
      failed = true;
      resolve(false);
    });

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      if (token && token.isCancelled) {
        try { child.kill(); } catch (_) {}
        return;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      if (isHeader) {
        isHeader = false;
        if (trimmed.startsWith('Error')) {
          failed = true;
          try { child.kill(); } catch (_) {}
          resolve(false);
        }
        return;
      }

      const matches = trimmed.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
      if (!matches || matches.length < 3) {
        return;
      }

      const cleanCol = (raw) => {
        let s = raw.startsWith(',') ? raw.slice(1).trim() : raw.trim();
        if (s.startsWith('"') && s.endsWith('"')) {
          s = s.slice(1, -1).replace(/""/g, '"');
        }
        return s;
      };

      const fullPath = cleanCol(matches[0]);
      const fileSize = parseInt(cleanCol(matches[1]), 10) || 0;
      const dateIso = cleanCol(matches[2]);

      if (!fullPath || fileSize === 0) {
        return;
      }

      const fileName = path.basename(fullPath);
      const isHidden = fileName.startsWith('.');
      if (!criteria.includeHidden && isHidden) {
        return;
      }

      // Filtro dimensioni
      const minBytes = Number(criteria.minSizeBytes) || 0;
      const maxBytes = Number(criteria.maxSizeBytes) || 0;
      if (minBytes > 0 && fileSize < minBytes) {
        skipStats.tooSmall += 1;
        return;
      }
      if (maxBytes > 0 && fileSize > maxBytes) {
        skipStats.tooLarge += 1;
        return;
      }

      // Filtro date
      const mtimeMs = dateIso ? new Date(dateIso).getTime() : 0;
      const afterMs = Number(criteria.modifiedAfterMs) || 0;
      const beforeMs = Number(criteria.modifiedBeforeMs) || 0;
      if (afterMs > 0 && mtimeMs < afterMs) {
        skipStats.tooOld += 1;
        return;
      }
      if (beforeMs > 0 && mtimeMs > beforeMs) {
        skipStats.tooNew += 1;
        return;
      }

      // Filtro estensioni
      const ext = path.extname(fileName).toLowerCase();
      if (criteria.includeExtensions && criteria.includeExtensions.length > 0) {
        const matchesInc = criteria.includeExtensions.some((item) => {
          const tok = String(item || '').toLowerCase();
          return tok === ext || ('.' + tok) === ext;
        });
        if (!matchesInc) {
          skipStats.wrongExt += 1;
          return;
        }
      }
      if (criteria.excludeExtensions && criteria.excludeExtensions.length > 0) {
        const matchesExc = criteria.excludeExtensions.some((item) => {
          const tok = String(item || '').toLowerCase();
          return tok === ext || ('.' + tok) === ext;
        });
        if (matchesExc) {
          skipStats.wrongExt += 1;
          return;
        }
      }

      collectedFiles.push({
        name: fileName,
        extension: ext,
        path: fullPath,
        size: fileSize,
        mtimeMs: Math.floor(mtimeMs),
        mtimeDate: dateIso || new Date(mtimeMs).toISOString(),
        partialHash: null,
        fullHash: null
      });

      if (collectedFiles.length % 25 === 0 && typeof onProgress === 'function') {
        onProgress({
          phase: 'collecting',
          currentFile: fullPath,
          filesCount: collectedFiles.length
        });
      }
    });

    child.on('close', (code) => {
      logger.debug(`[Everything] Processo es.exe terminato con exitCode=${code}, raccolti ${collectedFiles.length} file`);
      if (failed) {
        resolve(false);
      } else if (code === 0 || collectedFiles.length > 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

module.exports = {
  getEsBinaryPath,
  getEverythingEnginePath,
  isEverythingRunning,
  ensureEverythingEngine,
  stopEmbeddedEverything,
  walkWithEverything
};
