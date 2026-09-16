/**
 * @file main.js
 * @description Processo Principale (Main Process) di DUPLO in Electron.
 * Gestisce il ciclo di vita dell'applicazione desktop, l'apertura delle finestre native,
 * il routing IPC sicuro con il Renderer Process, la registrazione dei log su file persistente
 * e l'esecuzione asincrona del motore di ricerca duplicati.
 */

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const fsp = fs.promises;
const { logger, logSystemInfo, getLogFilePath } = require('./src/logger');
const { ScanCancellationToken, findDuplicates, normalizeCrossPlatformPath } = require('./src/scanner');
const { loadReadme, resolveReadmePath } = require('./src/readme');
const { createNativeMenu } = require('./src/nativeMenu');
const { filterDirectoryPathsAsync, validateDroppedPath } = require('./src/dropFilter');
const {
  resolveIncludeExtensions,
  normalizeDateRange
} = require('./src/advancedFilters');

/** Nome visibile in Task Manager, menu nativo e titolo finestra. */
const APP_NAME = 'DUPLO';
const WINDOW_TITLE = 'DUPLO - Trova File Duplicati';

if (typeof app.setName === 'function') {
  app.setName(APP_NAME);
}

function packagedReadmeOptions() {
  return {
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    packaged: app.isPackaged
  };
}

/**
 * Riferimento globale alla finestra principale per evitare che venga chiusa dal garbage collector.
 * @type {BrowserWindow|null}
 */
let mainWindow = null;

/**
 * Riferimento al token di cancellazione della scansione corrente.
 * @type {ScanCancellationToken|null}
 */
let activeCancellationToken = null;

/**
 * Azioni collegate alle voci native Aiuto. Vengono ricreate ad ogni
 * `createNativeMenu` così i click usano sempre il riferimento aggiornato
 * a `mainWindow` (null se la finestra è stata chiusa).
 *
 * @returns {{ openGuide: function(): void, openLogs: function(): void }}
 */
function nativeMenuActions() {
  return {
    openGuide: () => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          logger.info('[Menu] Invio al Renderer della richiesta di aprire la Guida');
          mainWindow.webContents.send('menu:open-guide');
        }
      } catch (err) {
        logger.error(`[Menu] Impossibile notificare la Guida al Renderer: ${err.message}`);
      }
    },
    openLogs: () => {
      try {
        const logPath = getLogFilePath();
        const logDir = path.dirname(logPath);
        logger.info(`[Menu] Apertura cartella log: "${logDir}"`);
        shell.openPath(logDir).catch((err) => {
          logger.error(`[Menu] shell.openPath log fallito: ${err.message}`);
        });
      } catch (err) {
        logger.error(`[Menu] Impossibile aprire la cartella dei log: ${err.message}`);
      }
    }
  };
}

/**
 * Crea e configura la finestra principale dell'applicazione.
 */
function createWindow() {
  logger.info('[Main] Creazione della finestra principale BrowserWindow');

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    // Fase 6.0: sotto queste soglie header, sidebar e risultati si sovrapporrebbero.
    minWidth: 920,
    minHeight: 700,
    title: WINDOW_TITLE,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,    // Sicurezza: disabilita Node.js nel renderer
      contextIsolation: true,   // Sicurezza: isola il contesto per usare contextBridge
      sandbox: false            // Permette a preload di interagire con IPC
    },
    backgroundColor: '#0f172a', // Sfondo scuro moderno
    show: false                 // Mostra solo quando è pronta per evitare sfarfallio
  });

  // Carica il file HTML dell'interfaccia utente
  const indexPath = path.join(__dirname, 'src', 'renderer', 'index.html');
  let indexUrl = '';
  try {
    indexUrl = pathToFileURL(indexPath).href;
  } catch (err) {
    logger.warn(`[Main] pathToFileURL(index.html) fallito: ${err.message}`);
  }
  logger.info(`[Main] Caricamento interfaccia utente da: "${indexPath}"`);
  mainWindow.loadFile(indexPath);

  // Un drop di file sulla finestra non deve navigare via dall'app (sostituirebbe la UI).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (indexUrl && typeof url === 'string' && (url === indexUrl || url.startsWith(`${indexUrl}#`))) {
        return;
      }
      event.preventDefault();
      logger.warn(`[Main] will-navigate bloccato (probabile drop): ${url}`);
    } catch (err) {
      event.preventDefault();
      logger.warn(`[Main] will-navigate handler fallito: ${err.message}`);
    }
  });

  try {
    mainWindow.webContents.on('will-redirect', (event, url) => {
      event.preventDefault();
      logger.warn(`[Main] will-redirect bloccato (probabile drop): ${url}`);
    });
  } catch (err) {
    logger.warn(`[Main] will-redirect non disponibile: ${err.message}`);
  }

  try {
    mainWindow.webContents.setWindowOpenHandler((details) => {
      logger.warn(`[Main] Apertura finestra bloccata: ${(details && details.url) || ''}`);
      return { action: 'deny' };
    });
  } catch (err) {
    logger.warn(`[Main] setWindowOpenHandler fallito: ${err.message}`);
  }

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(WINDOW_TITLE);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    logger.info('[Main] Finestra principale mostrata all\'utente');
  });

  mainWindow.on('closed', () => {
    logger.info('[Main] Finestra principale chiusa');
    mainWindow = null;
  });
}

/**
 * Icona nativa della finestra: su Windows preferisce `build/icon.ico`
 * (stesso file che electron-builder timbra sull'exe). Fallback PNG.
 *
 * @returns {string|undefined}
 */
function resolveWindowIcon() {
  try {
    const ico = path.join(__dirname, 'build', 'icon.ico');
    const png = path.join(__dirname, 'build', 'icon.png');
    if (process.platform === 'win32' && fs.existsSync(ico)) {
      logger.info(`[Main] Icona finestra Windows: "${ico}"`);
      return ico;
    }
    if (fs.existsSync(png)) {
      logger.info(`[Main] Icona finestra: "${png}"`);
      return png;
    }
    if (fs.existsSync(ico)) {
      logger.info(`[Main] Icona finestra (ico fallback): "${ico}"`);
      return ico;
    }
    logger.warn('[Main] Nessuna icona in build/icon.ico o build/icon.png');
  } catch (err) {
    logger.error(`[Main] Risoluzione icona fallita: ${err.message}`);
  }
  return undefined;
}

/**
 * Inizializzazione dell'applicazione Electron al completamento dell'evento 'ready'.
 */
app.whenReady().then(() => {
  app.setName(APP_NAME);
  logSystemInfo();
  logger.info(`[Main] Nome applicazione: ${APP_NAME}`);
  logger.info('[Main] Avvio senza FFmpeg: hashing solo con crypto nativo (SHA-256/MD5)');
  // Menu nativo in italiano all'avvio; il Renderer potrà cambiarlo via IPC.
  try {
    createNativeMenu('it', nativeMenuActions());
  } catch (err) {
    logger.error(`[Main] Menu nativo non applicato: ${err.message}`);
  }
  createWindow();

  // Su macOS, ricrea la finestra quando l'icona nel dock viene cliccata e non ci sono altre finestre aperte
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Uscita dall'applicazione quando tutte le finestre sono chiuse (eccetto su macOS, secondo convenzioni Apple).
 */
app.on('window-all-closed', () => {
  logger.info('[Main] Tutte le finestre sono state chiuse');
  if (process.platform !== 'darwin') {
    logger.info('[Main] Arresto applicazione');
    app.quit();
  }
});

// =========================================================================
// GESTIONE DEI CANALI IPC (INTER-PROCESS COMMUNICATION)
// =========================================================================

/**
 * Dialog nativo per la selezione di una cartella.
 */
ipcMain.handle('dialog:select-directory', async () => {
  logger.info('[IPC] Richiesta apertura dialogo nativo per selezione cartella');
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleziona cartella da analizzare',
      properties: ['openDirectory', 'dontAddToRecent']
    });

    if (result.canceled || result.filePaths.length === 0) {
      logger.info('[IPC] Selezione cartella annullata dall\'utente');
      return null;
    }

    const selectedPath = normalizeCrossPlatformPath(result.filePaths[0]);
    logger.info(`[IPC] Cartella selezionata con successo: "${selectedPath}"`);
    return selectedPath;
  } catch (err) {
    logger.error(`[IPC] Errore durante l'apertura del dialogo cartella: ${err.message}`);
    return null;
  }
});

/**
 * Validazione di UN path droppato: `fs.promises.stat` + `isDirectory()`.
 * Canale richiesto dal contratto drop (`window.duploAPI.validateAndAddFolder`).
 *
 * @returns {Promise<{ok: boolean, directory: string|null, skipped: {path: string, reason: string}|null}>}
 */
ipcMain.handle('validate-and-add-folder', async (_event, rawPath) => {
  logger.info(`[IPC] validate-and-add-folder ricevuto: ${JSON.stringify(rawPath)}`);
  try {
    const result = await validateDroppedPath(rawPath);
    if (result.ok) {
      logger.info(`[IPC] Cartella drop valida: "${result.directory}"`);
    } else {
      logger.warn(`[IPC] Path drop scartato: ${(result.skipped && result.skipped.path) || rawPath} (${(result.skipped && result.skipped.reason) || 'sconosciuto'})`);
    }
    return result;
  } catch (err) {
    logger.error(`[IPC] validate-and-add-folder fallito: ${err.message}`);
    return {
      ok: false,
      directory: null,
      skipped: { path: String(rawPath || ''), reason: err.message }
    };
  }
});

/**
 * Filtra un elenco di path provenienti da un drop HTML5: tiene solo le directory.
 * Usa `fs.promises.stat` in try/catch per ogni voce (file, path inesistenti, EACCES).
 *
 * @returns {Promise<{directories: string[], skipped: Array<{path: string, reason: string}>}>}
 */
ipcMain.handle('fs:filter-directories', async (_event, rawPaths) => {
  const list = Array.isArray(rawPaths) ? rawPaths : [];
  logger.info(`[IPC] Filtro drop: ${list.length} path da verificare con fs.promises.stat`);
  try {
    return await filterDirectoryPathsAsync(list);
  } catch (err) {
    logger.error(`[IPC] Filtro drop fallito: ${err.message}`);
    return { directories: [], skipped: [{ path: '', reason: err.message }] };
  }
});

/**
 * Avvio asincrono della scansione per la ricerca dei duplicati.
 */
ipcMain.handle('scan:start', async (_event, payload) => {
  const { directories } = payload || {};
  logger.info(`[IPC] Avvio richiesta scansione su ${directories ? directories.length : 0} cartelle`);

  if (!directories || directories.length === 0) {
    logger.warn('[IPC] Nessuna cartella valida ricevuta per la scansione');
    throw new Error('Specificare almeno una cartella da scansionare');
  }

  // Copia difensiva: non mutiamo l'oggetto arrivato dal Renderer.
  const rawCriteria = (payload && payload.criteria) ? payload.criteria : {};
  let criteria = { ...rawCriteria };

  try {
    // Formato esatto (customExtensions) batte la categoria generale (includeExtensions).
    const resolvedExt = resolveIncludeExtensions(criteria.customExtensions, criteria.includeExtensions);
    if (resolvedExt.usedCustom) {
      logger.info(`[IPC] Formato esatto attivo [${resolvedExt.includeExtensions.join(', ')}]: categoria generale ignorata`);
    } else {
      logger.info(`[IPC] Estensioni da categoria: ${resolvedExt.includeExtensions.length ? resolvedExt.includeExtensions.join(', ') : '(tutti i tipi)'}`);
    }
    criteria.includeExtensions = resolvedExt.includeExtensions;

    const range = normalizeDateRange(criteria.modifiedAfterMs, criteria.modifiedBeforeMs);
    if (range.swapped) {
      logger.warn('[IPC] Intervallo date invertito dall\'utente: scambio "dal" e "fino al"');
    }
    criteria.modifiedAfterMs = range.modifiedAfterMs;
    criteria.modifiedBeforeMs = range.modifiedBeforeMs;

    criteria.minSizeBytes = Number(criteria.minSizeBytes) || 0;
    criteria.maxSizeBytes = Number(criteria.maxSizeBytes) || 0;
    if (criteria.maxSizeBytes > 0 && criteria.minSizeBytes > criteria.maxSizeBytes) {
      logger.warn(`[IPC] minSize (${criteria.minSizeBytes}) > maxSize (${criteria.maxSizeBytes}): scambio i limiti`);
      const tmp = criteria.minSizeBytes;
      criteria.minSizeBytes = criteria.maxSizeBytes;
      criteria.maxSizeBytes = tmp;
    }

    logger.info(`[IPC] Criteri normalizzati: min=${criteria.minSizeBytes}B max=${criteria.maxSizeBytes}B after=${criteria.modifiedAfterMs} before=${criteria.modifiedBeforeMs}`);
  } catch (normErr) {
    logger.error(`[IPC] Normalizzazione criteri fallita: ${normErr.message}`);
    throw new Error('Parametri di scansione non validi');
  }

  // Istanzia un nuovo token di cancellazione
  activeCancellationToken = new ScanCancellationToken();

  try {
    // Esegue la scansione inviando eventi di progresso al Renderer
    const duplicateGroups = await findDuplicates(
      directories,
      criteria,
      activeCancellationToken,
      (progressData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan:progress', progressData);
        }
      }
    );

    logger.info(`[IPC] Scansione completata. Trovati ${duplicateGroups.length} gruppi duplicati.`);
    return duplicateGroups;
  } catch (err) {
    logger.error(`[IPC] Errore imprevisto durante la scansione: ${err.message}`, err);
    throw err;
  } finally {
    activeCancellationToken = null;
  }
});

/**
 * Annullamento della scansione in corso.
 */
ipcMain.handle('scan:cancel', async () => {
  logger.info('[IPC] Richiesta di interruzione scansione ricevuta dal Renderer');
  if (activeCancellationToken) {
    activeCancellationToken.cancel();
    return true;
  }
  return false;
});

/**
 * Eliminazione sicura di un file duplicato selezionato dall'utente.
 */
ipcMain.handle('file:delete', async (_event, filePath) => {
  const normalized = normalizeCrossPlatformPath(filePath);
  logger.info(`[IPC] Richiesta eliminazione file: "${normalized}"`);

  try {
    // Utilizza unlink (eliminazione)
    await fsp.unlink(normalized);
    logger.info(`[IPC] File eliminato con successo: "${normalized}"`);
    return { success: true };
  } catch (err) {
    logger.error(`[IPC] Fallimento eliminazione file "${normalized}": [${err.code || 'UNKNOWN'}] ${err.message}`);
    return { success: false, error: err.message };
  }
});

/**
 * Spostamento di un file duplicato in un'altra cartella (quarantena/revisione).
 */
ipcMain.handle('file:move', async (_event, { sourcePath, destFolder }) => {
  const normSource = normalizeCrossPlatformPath(sourcePath);
  const normDestDir = normalizeCrossPlatformPath(destFolder);
  const fileName = path.basename(normSource);
  const targetPath = path.join(normDestDir, fileName);

  logger.info(`[IPC] Richiesta spostamento file da "${normSource}" a "${targetPath}"`);

  try {
    // Crea la cartella di destinazione se non esiste
    await fsp.mkdir(normDestDir, { recursive: true });
    await fsp.rename(normSource, targetPath);
    logger.info(`[IPC] File spostato con successo in "${targetPath}"`);
    return { success: true };
  } catch (err) {
    logger.error(`[IPC] Fallimento spostamento file: [${err.code || 'UNKNOWN'}] ${err.message}`);
    return { success: false, error: err.message };
  }
});

/**
 * Mostra il file nel gestore file di sistema (Explorer, Finder, File Manager Linux).
 */
ipcMain.handle('shell:show-item', async (_event, filePath) => {
  const normalized = normalizeCrossPlatformPath(filePath);
  logger.info(`[IPC] Apertura file manager di sistema per evidenziare: "${normalized}"`);
  try {
    shell.showItemInFolder(normalized);
    return true;
  } catch (err) {
    logger.error(`[IPC] Errore apertura file manager per "${normalized}": ${err.message}`);
    return false;
  }
});

/**
 * Valori ammessi per nativeTheme.themeSource (Electron).
 * Qualsiasi altro input viene rifiutato: non vogliamo stati tema indefinibili.
 * @type {ReadonlySet<string>}
 */
const ALLOWED_NATIVE_THEMES = new Set(['dark', 'light', 'system']);

/**
 * Attende un breve intervallo (retry unico su EBUSY: file lockato da antivirus/indexer).
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Costruisce il nuovo path nella *stessa* cartella del file originale.
 * Il "nuovo nome" deve essere solo un basename: niente slash, niente `..`.
 *
 * @param {string} oldPath - Percorso assoluto attuale
 * @param {string} newName - Nome file richiesto dall'utente (con o senza estensione)
 * @returns {{ ok: true, destPath: string, finalName: string } | { ok: false, error: string }}
 */
function resolveRenameDestination(oldPath, newName) {
  const trimmed = String(newName || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Il nuovo nome non può essere vuoto' };
  }
  if (/[/\\]/.test(trimmed) || trimmed.includes('\0') || trimmed === '.' || trimmed === '..') {
    logger.warn(`[IPC] rename-file rifiutato: nome non valido "${trimmed}"`);
    return { ok: false, error: 'Il nuovo nome non può contenere percorsi o caratteri riservati' };
  }
  const base = path.basename(trimmed);
  if (base !== trimmed) {
    return { ok: false, error: 'Il nuovo nome deve essere un nome file, non un percorso' };
  }

  const dir = path.dirname(oldPath);
  const oldExt = path.extname(oldPath);
  // Se l'utente omette l'estensione, conserviamo quella originale (es. foto.jpg → foto-2.jpg).
  const finalName = path.extname(base) ? base : `${base}${oldExt}`;
  const destPath = path.join(dir, finalName);
  if (path.dirname(destPath) !== dir) {
    return { ok: false, error: 'Destinazione di rinomina fuori dalla cartella originale' };
  }
  return { ok: true, destPath, finalName };
}

/**
 * Fase 4.0 — Rinomina un file sul disco senza rifare la scansione.
 * Payload: { oldPath, newName }. Retry unico su EBUSY.
 *
 * @returns {Promise<{success: boolean, oldPath?: string, newPath?: string, error?: string, code?: string}>}
 */
ipcMain.handle('rename-file', async (_event, payload) => {
  const oldPathRaw = payload && payload.oldPath;
  const newNameRaw = payload && payload.newName;
  const oldPath = normalizeCrossPlatformPath(oldPathRaw);

  logger.info(`[IPC] rename-file richiesto: "${oldPath}" → nome "${newNameRaw}"`);

  if (!oldPath) {
    logger.warn('[IPC] rename-file: percorso sorgente vuoto');
    return { success: false, error: 'Percorso file mancante', code: 'EINVAL' };
  }

  const dest = resolveRenameDestination(oldPath, newNameRaw);
  if (!dest.ok) {
    return { success: false, error: dest.error, code: 'EINVAL' };
  }

  if (dest.destPath === oldPath) {
    logger.info(`[IPC] rename-file: nome invariato per "${oldPath}"`);
    return { success: true, oldPath, newPath: oldPath };
  }

  const attemptRename = async () => {
    await fsp.rename(oldPath, dest.destPath);
  };

  try {
    await fsp.access(oldPath, fs.constants.F_OK);
  } catch (err) {
    logger.error(`[IPC] rename-file sorgente assente "${oldPath}": [${err.code || 'UNKNOWN'}] ${err.message}`);
    return { success: false, error: err.message, code: err.code || 'ENOENT' };
  }

  try {
    await fsp.access(dest.destPath, fs.constants.F_OK);
    logger.warn(`[IPC] rename-file bloccato: destinazione già esistente "${dest.destPath}"`);
    return { success: false, error: `Esiste già un file chiamato "${dest.finalName}"`, code: 'EEXIST' };
  } catch (existsErr) {
    if (existsErr.code !== 'ENOENT') {
      logger.error(`[IPC] rename-file stat destinazione "${dest.destPath}": [${existsErr.code || 'UNKNOWN'}] ${existsErr.message}`);
      return { success: false, error: existsErr.message, code: existsErr.code || 'ERR' };
    }
  }

  try {
    try {
      await attemptRename();
    } catch (firstErr) {
      if (firstErr.code === 'EBUSY' || firstErr.code === 'EPERM' || firstErr.code === 'EACCES') {
        logger.warn(`[IPC] rename-file ${firstErr.code} su "${oldPath}", retry dopo 150ms`);
        await sleep(150);
        await attemptRename();
      } else {
        throw firstErr;
      }
    }
    logger.info(`[IPC] rename-file ok: "${oldPath}" → "${dest.destPath}"`);
    return { success: true, oldPath, newPath: dest.destPath };
  } catch (err) {
    logger.error(`[IPC] rename-file fallito "${oldPath}" → "${dest.destPath}": [${err.code || 'UNKNOWN'}] ${err.message}`);
    return { success: false, error: err.message, code: err.code || 'ERR' };
  }
});

/**
 * Fase 4.0 — Apre il file manager nativo e seleziona il file.
 * Usa ESCLUSIVAMENTE `shell.showItemInFolder` (nessun openPath / openExternal sul file).
 *
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
ipcMain.handle('open-file-location', async (_event, filePath) => {
  const normalized = normalizeCrossPlatformPath(filePath);
  logger.info(`[IPC] open-file-location: shell.showItemInFolder("${normalized}")`);

  if (!normalized) {
    logger.warn('[IPC] open-file-location: percorso vuoto');
    return { success: false, error: 'Percorso file mancante' };
  }

  try {
    await fsp.access(normalized, fs.constants.F_OK);
  } catch (err) {
    logger.error(`[IPC] open-file-location file inesistente "${normalized}": [${err.code || 'UNKNOWN'}] ${err.message}`);
    return { success: false, error: err.message, code: err.code || 'ENOENT' };
  }

  try {
    shell.showItemInFolder(normalized);
    logger.info(`[IPC] open-file-location: file manager aperto per "${normalized}"`);
    return { success: true, path: normalized };
  } catch (err) {
    logger.error(`[IPC] open-file-location fallito "${normalized}": ${err.message}`);
    return { success: false, error: err.message };
  }
});

/**
 * Fase 4.0 — Allinea il tema delle finestre native (dialoghi, menu) a light/dark/system.
 * `nativeTheme.themeSource` è la API Electron ufficiale; i dialoghi "Seleziona cartella"
 * seguono questo valore sul sistema ospite.
 *
 * @returns {Promise<{success: boolean, themeSource?: string, shouldUseDarkColors?: boolean, error?: string}>}
 */
ipcMain.handle('set-native-theme', async (_event, source) => {
  const requested = String(source || '').trim().toLowerCase();
  logger.info(`[IPC] set-native-theme richiesto: "${requested}"`);

  if (!ALLOWED_NATIVE_THEMES.has(requested)) {
    logger.warn(`[IPC] set-native-theme rifiutato: valore non ammesso "${source}"`);
    return { success: false, error: 'Tema non valido: usare dark, light o system' };
  }

  try {
    nativeTheme.themeSource = requested;
    const applied = nativeTheme.themeSource;
    const dark = Boolean(nativeTheme.shouldUseDarkColors);
    logger.info(`[IPC] set-native-theme applicato: themeSource="${applied}" shouldUseDarkColors=${dark}`);
    return { success: true, themeSource: applied, shouldUseDarkColors: dark };
  } catch (err) {
    logger.error(`[IPC] set-native-theme fallito: ${err.message}`);
    return { success: false, error: err.message };
  }
});

/**
 * Restituisce il percorso fisico del file di log per la diagnosi.
 */
ipcMain.handle('app:get-log-path', async () => {
  const logPath = getLogFilePath();
  logger.info(`[IPC] Richiesta percorso file di log: "${logPath}"`);
  return logPath;
});

/**
 * Restituisce il testo del README incluso nell'applicazione (manuale utente).
 */
ipcMain.handle('app:get-readme', async () => {
  try {
    const loaded = loadReadme(packagedReadmeOptions());
    logger.info(`[IPC] README caricato da: "${loaded.path}"`);
    return { success: true, path: loaded.path, content: loaded.content };
  } catch (err) {
    logger.error(`[IPC] Impossibile leggere il README: ${err.message}`);
    return { success: false, error: err.message };
  }
});

/**
 * Apre il file README.md con l'applicazione predefinita del sistema.
 */
ipcMain.handle('app:open-readme', async () => {
  const readmePath = resolveReadmePath(packagedReadmeOptions());
  logger.info(`[IPC] Apertura README nel visualizzatore di sistema: "${readmePath}"`);
  if (!readmePath) {
    return { success: false, error: 'README.md non trovato' };
  }
  const errorMsg = await shell.openPath(readmePath);
  if (errorMsg) {
    logger.error(`[IPC] shell.openPath ha restituito: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
  return { success: true, path: readmePath };
});

/**
 * Esporta il report dei duplicati in formato JSON o CSV.
 */
ipcMain.handle('report:export', async (_event, { format, groups }) => {
  logger.info(`[IPC] Richiesta esportazione report in formato: ${format}`);
  try {
    const ext = format === 'csv' ? 'csv' : 'json';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Esporta Report DUPLO (${format.toUpperCase()})`,
      defaultPath: `duplo-report.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }]
    });

    if (result.canceled || !result.filePath) {
      logger.info('[IPC] Esportazione report annullata dall\'utente');
      return { success: false, canceled: true };
    }

    const savePath = normalizeCrossPlatformPath(result.filePath);

    if (format === 'csv') {
      let csvContent = 'Gruppo,Hash,Dimensione_Byte,Dimensione_Leggibile,Percorso_File,Data_Modifica\n';
      groups.forEach((g) => {
        g.files.forEach((f) => {
          const escPath = `"${f.path.replace(/"/g, '""')}"`;
          const escHash = `"${(g.hash || '').replace(/"/g, '""')}"`;
          const readableSize = formatBytes(g.size);
          csvContent += `${g.groupId},${escHash},${g.size},"${readableSize}",${escPath},"${f.mtimeDate}"\n`;
        });
      });
      await fsp.writeFile(savePath, csvContent, 'utf-8');
    } else {
      const jsonContent = JSON.stringify({
        exportedAt: new Date().toISOString(),
        groupCount: groups.length,
        groups: groups
      }, null, 2);
      await fsp.writeFile(savePath, jsonContent, 'utf-8');
    }

    logger.info(`[IPC] Report esportato con successo in: "${savePath}"`);
    return { success: true, path: savePath };
  } catch (err) {
    logger.error(`[IPC] Errore esportazione report: ${err.message}`);
    return { success: false, error: err.message };
  }
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Cambio lingua richiesto dal Renderer: ricostruisce istantaneamente
 * la barra nativa (File/Modifica/… o File/Edit/…) con Menu.buildFromTemplate.
 */
ipcMain.on('language-changed', (_event, lang) => {
  logger.info(`[IPC] language-changed ricevuto dal Renderer: "${lang}"`);
  try {
    const applied = createNativeMenu(lang, nativeMenuActions());
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('language-changed-applied', applied);
    }
  } catch (err) {
    logger.error(`[IPC] Aggiornamento menu nativo fallito: ${err.message}`);
  }
});

/**
 * Riceve eventi e log generati dal Renderer Process e li scrive nel logger persistente.
 */
ipcMain.on('log:renderer', (_event, { level, message }) => {
  const validLevel = ['info', 'warn', 'error', 'debug'].includes(level) ? level : 'info';
  logger[validLevel](`[RendererUI] ${message}`);
});
