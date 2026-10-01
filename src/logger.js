/**
 * @file logger.js
 * @description Modulo centralizzato di tracciamento e logging per DUPLO.
 * Configura electron-log per consentire un logging capillare su console in ambiente di sviluppo
 * e su file fisico persistente in ambiente di produzione (AppData su Windows, .config su Linux).
 * 
 * Ogni operazione critica, scansione, hashing, errore o evento UI transita attraverso questo logger.
 */

const log = require('electron-log');
const path = require('path');
const os = require('os');

/**
 * Configurazione del formato e dei trasporti di electron-log.
 * Formato log: [YYYY-MM-DD HH:mm:ss.SSS] [LIVELLO] Messaggio
 */
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Imposta il livello di dettaglio del logger: 'debug' traccia qualsiasi informazione utile
log.transports.file.level = 'debug';
log.transports.console.level = 'debug';

// Limite massimo di dimensione per ogni file di log prima della rotazione automatica (5 MB)
log.transports.file.maxSize = 5 * 1024 * 1024;

try {
  log.transports.file.resolvePathFn = () => {
    try {
      const { app } = require('electron');
      const userData = app && typeof app.getPath === 'function'
        ? app.getPath('userData')
        : path.join(os.homedir(), 'DUPLO');
      return path.join(userData, 'logs', 'main.log');
    } catch (_err) {
      return path.join(os.homedir(), 'DUPLO', 'logs', 'main.log');
    }
  };
} catch (_err) {
  /* electron-log senza resolvePathFn: resta il default */
}

/**
 * Restituisce il percorso assoluto del file di log corrente sul sistema operativo ospite.
 * Utile sia per scopi di debug sia per esporre la posizione dei log all'utente nell'interfaccia.
 *
 * @returns {string} Percorso completo del file di log
 */
function getLogFilePath() {
  try {
    const fileTransport = log.transports.file;
    if (fileTransport && typeof fileTransport.getFile === 'function') {
      return fileTransport.getFile().path;
    }
    // Fallback calcolato manualmente nel caso l'app non sia ancora del tutto inizializzata
    return path.join(os.homedir(), 'DUPLO', 'logs', 'main.log');
  } catch (err) {
    console.error('Errore durante il recupero del percorso del file di log:', err);
    return '';
  }
}

/**
 * Registra piattaforma, kernel, architettura, versioni Node/Electron all'avvio.
 * @returns {void}
 */
function logSystemInfo() {
  log.info('======================================================');
  log.info(' Avvio DUPLO in corso...');
  log.info('======================================================');
  log.info(`Data/Ora locale:   ${new Date().toISOString()}`);
  log.info(`Piattaforma:       ${process.platform} (${os.type()} ${os.release()} ${os.arch()})`);
  log.info(`Architettura CPU:  ${process.arch} (${os.cpus() ? os.cpus().length : 'N/A'} core - ${os.cpus() && os.cpus()[0] ? os.cpus()[0].model : ''})`);
  log.info(`Memoria di sistema: Totale: ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB, Libera: ${(os.freemem() / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  log.info(`Versione Node.js:  ${process.versions.node}`);
  log.info(`Versione Electron: ${process.versions.electron || 'N/A'}`);
  log.info(`Versione V8:       ${process.versions.v8 || 'N/A'}`);
  log.info(`Process PID:       ${process.pid}`);
  log.info(`Exec Path:         ${process.execPath}`);
  log.info(`Cwd:               ${process.cwd()}`);
  log.info(`File di log:       ${getLogFilePath()}`);
  log.info('======================================================');
}

// Cattura e logga automaticamente ogni uncaughtException nel Main Process
process.on('uncaughtException', (err) => {
  log.error('[CRITICAL] Eccezione non gestita (uncaughtException) nel Main Process:', err && err.stack ? err.stack : err);
});

// Cattura e logga automaticamente ogni unhandledRejection nel Main Process
process.on('unhandledRejection', (reason, promise) => {
  log.error('[CRITICAL] Promise rifiutata non gestita (unhandledRejection) nel Main Process:', reason && reason.stack ? reason.stack : reason);
});

module.exports = {
  logger: log,
  getLogFilePath,
  logSystemInfo
};
