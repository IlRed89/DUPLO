/**
 * @file logger.js
 * @description Modulo centralizzato di tracciamento e logging per DupFinder.
 * Configura electron-log per consentire un logging capillare su console in ambiente di sviluppo
 * e su file fisico persistente in ambiente di produzione (AppData su Windows, Application Support su macOS, .config su Linux).
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
    return path.join(os.homedir(), '.dupfinder', 'logs', 'main.log');
  } catch (err) {
    console.error('Errore durante il recupero del percorso del file di log:', err);
    return '';
  }
}

/**
 * Funzione helper per registrare informazioni di contesto sul sistema operativo all'avvio.
 * Registra piattaforma, release del kernel, architettura CPU, versione Node ed Electron.
 */
function logSystemInfo() {
  log.info('======================================================');
  log.info(' DupFinder - Avvio Sessione di Esecuzione');
  log.info('======================================================');
  log.info(`Piattaforma:       ${process.platform} (${os.type()} ${os.release()})`);
  log.info(`Architettura CPU:  ${process.arch}`);
  log.info(`Versione Node.js:  ${process.versions.node}`);
  log.info(`Versione Electron: ${process.versions.electron || 'N/A'}`);
  log.info(`File di log:       ${getLogFilePath()}`);
  log.info('======================================================');
}

module.exports = {
  logger: log,
  getLogFilePath,
  logSystemInfo
};
