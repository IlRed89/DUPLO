/**
 * @file main.js
 * @description Processo Principale (Main Process) di DUPLO.
 *
 * Responsabilità:
 * - ciclo di vita Electron (finestra, menu nativo, quit);
 * - IPC request/response tramite `ipcMain.handle` + `ipcRenderer.invoke`
 *   (niente listener `on` accumulati sul Renderer per le chiamate sincrone);
 * - unico push Main→Renderer: `scan:progress` e `menu:open-guide`;
 * - unico fire-and-forget Renderer→Main: `log:renderer` (`send`, non serve ack).
 *
 * Sandbox del Renderer: `nodeIntegration: false`, `contextIsolation: true`.
 * Il preload è l'unico ponte (`window.duploAPI`).
 */

'use strict';

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
const { resolveIncludeExtensions, normalizeDateRange } = require('./src/advancedFilters');
const { formatBytes } = require('./src/formatBytes');

/** Nome visibile in Task Manager, menu nativo e titolo finestra. */
const APP_NAME = 'DUPLO';
/** Titolo fisso: `page-title-updated` lo reimposta se l'HTML prova a cambiarlo. */
const WINDOW_TITLE = 'DUPLO - Trova File Duplicati';
/** Valori ammessi per `nativeTheme.themeSource` (Electron). */
const ALLOWED_NATIVE_THEMES = new Set(['dark', 'light', 'system']);

if (typeof app.setName === 'function') {
  app.setName(APP_NAME);
}

/**
 * Opzioni per localizzare README.md in sviluppo (`app.getAppPath`) e nel
 * pacchetto (`process.resourcesPath` / extraResources).
 *
 * @returns {{ resourcesPath: string, appPath: string, packaged: boolean }}
 */
function packagedReadmeOptions() {
  return {
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    packaged: app.isPackaged
  };
}

/**
 * Riferimento globale alla finestra: senza di esso il GC chiuderebbe la UI.
 * @type {BrowserWindow|null}
 */
let mainWindow = null;

/**
 * Token della scansione in corso. Un solo scan alla volta: un secondo
 * `scan:start` sovrascrive il token (il Renderer disabilita il bottone).
 * @type {ScanCancellationToken|null}
 */
let activeCancellationToken = null;

/**
 * Azioni del menu nativo Aiuto. Ricreate ad ogni `createNativeMenu` così
 * i click usano sempre il `mainWindow` corrente (null se chiusa).
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
 * Crea e configura la finestra principale.
 * `show: false` + `ready-to-show` evita il flash bianco su Windows.
 *
 * @returns {void}
 */
function createWindow() {
  logger.info('[Main] Creazione della finestra principale BrowserWindow');

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    minWidth: 920,
    minHeight: 700,
    title: WINDOW_TITLE,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    backgroundColor: '#0f172a',
    show: false
  });

  const indexPath = path.join(__dirname, 'src', 'renderer', 'index.html');
  let indexUrl = '';
  try {
    indexUrl = pathToFileURL(indexPath).href;
  } catch (err) {
    logger.warn(`[Main] pathToFileURL(index.html) fallito: ${err.message}`);
  }
  logger.info(`[Main] Caricamento interfaccia utente da: "${indexPath}"`);
  mainWindow.loadFile(indexPath);

  // Un drop di file sulla chrome nativa non deve navigare via (sostituirebbe la UI).
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
 * Attende un breve intervallo (retry unico su EBUSY: file lockato da antivirus).
 *
 * @param {number} ms Millisecondi.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Costruisce il nuovo path nella *stessa* cartella del file originale.
 * Il "nuovo nome" deve essere solo un basename: niente slash, niente `..`.
 *
 * @param {string} oldPath Percorso assoluto attuale.
 * @param {unknown} newName Nome file richiesto dall'utente.
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
  const finalName = path.extname(base) ? base : `${base}${oldExt}`;
  const destPath = path.join(dir, finalName);
  if (path.dirname(destPath) !== dir) {
    return { ok: false, error: 'Destinazione di rinomina fuori dalla cartella originale' };
  }
  return { ok: true, destPath, finalName };
}

/**
 * Normalizza i criteri di scansione arrivati dal Renderer.
 * Date invertite e min>max vengono scambiati (non facciamo fallire la scan).
 *
 * @param {Object} rawCriteria
 * @returns {Object}
 * @throws {Error} Se la normalizzazione lancia (input non oggetto).
 */
function normalizeScanCriteria(rawCriteria) {
  const criteria = { ...(rawCriteria || {}) };
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
  return criteria;
}

app.whenReady().then(() => {
  app.setName(APP_NAME);
  logSystemInfo();
  logger.info(`[Main] Nome applicazione: ${APP_NAME}`);
  logger.info('[Main] Avvio senza FFmpeg: hashing solo con crypto nativo (SHA-256/MD5)');
  try {
    createNativeMenu('it', nativeMenuActions());
  } catch (err) {
    logger.error(`[Main] Menu nativo non applicato: ${err.message}`);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('[Main] Tutte le finestre sono state chiuse');
  if (process.platform !== 'darwin') {
    logger.info('[Main] Arresto applicazione');
    app.quit();
  }
});

// =========================================================================
// IPC — request/response (`handle` + `invoke`). Ogni handler cattura e
// restituisce un risultato: niente UnhandledPromiseRejection verso il Renderer.
// =========================================================================

/**
 * Dialog nativo per la selezione di una cartella.
 *
 * @returns {Promise<string|null>}
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
    return selectedPath || null;
  } catch (err) {
    logger.error(`[IPC] Errore durante l'apertura del dialogo cartella: ${err.message}`);
    return null;
  }
});

/**
 * Validazione di UN path droppato: `fs.promises.stat` + `isDirectory()`.
 * Contratto drop: `window.duploAPI.validateAndAddFolder`.
 *
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {unknown} rawPath
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
 * Filtra un elenco di path droppati: tiene solo le directory.
 *
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {unknown} rawPaths
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
 * Avvio asincrono della scansione duplicati.
 *
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ directories?: unknown, criteria?: Object }} payload
 * @returns {Promise<Array<Object>>}
 * @throws {Error} Cartelle mancanti o parametri non normalizzabili.
 */
ipcMain.handle('scan:start', async (_event, payload) => {
  const rawDirs = payload && Array.isArray(payload.directories) ? payload.directories : [];
  const directories = rawDirs
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  logger.info(`[IPC] Avvio richiesta scansione su ${directories.length} cartelle`);

  if (directories.length === 0) {
    logger.warn('[IPC] Nessuna cartella valida ricevuta per la scansione');
    throw new Error('Specificare almeno una cartella da scansionare');
  }

  let criteria;
  try {
    criteria = normalizeScanCriteria(payload && payload.criteria);
  } catch (normErr) {
    logger.error(`[IPC] Normalizzazione criteri fallita: ${normErr.message}`);
    throw new Error('Parametri di scansione non validi');
  }

  activeCancellationToken = new ScanCancellationToken();

  try {
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
 *
 * @returns {Promise<boolean>}
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
 * Eliminazione di un file duplicato (`unlink`, non cestino).
 *
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {unknown} filePath
 * @returns {Promise<{success: boolean, error?: string, code?: string}>}
 */
ipcMain.handle('file:delete', async (_event, filePath) => {
  const normalized = normalizeCrossPlatformPath(filePath);
  logger.info(`[IPC] Richiesta eliminazione file: "${normalized}"`);

  if (!normalized) {
    logger.warn('[IPC] file:delete: percorso vuoto');
    return { success: false, error: 'Percorso file mancante', code: 'EINVAL' };
  }

  try {
    await fsp.unlink(normalized);
    logger.info(`[IPC] File eliminato con successo: "${normalized}"`);
    return { success: true };
  } catch (err) {
    logger.error(`[IPC] Fallimento eliminazione file "${normalized}": [${err.code || 'UNKNOWN'}] ${err.message}`);
    return { success: false, error: err.message, code: err.code };
  }
});

/**
 * Mostra il file nel gestore nativo (Explorer, Finder, file manager Linux).
 *
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {unknown} filePath
 * @returns {Promise<boolean>}
 */
ipcMain.handle('shell:show-item', async (_event, filePath) => {
  const normalized = normalizeCrossPlatformPath(filePath);
  logger.info(`[IPC] Apertura file manager di sistema per evidenziare: "${normalized}"`);
  if (!normalized) {
    logger.warn('[IPC] shell:show-item: percorso vuoto');
    return false;
  }
  try {
    shell.showItemInFolder(normalized);
    return true;
  } catch (err) {
    logger.error(`[IPC] Errore apertura file manager per "${normalized}": ${err.message}`);
    return false;
  }
});

/**
 * Rinomina un file sul disco senza rifare la scansione.
 * Retry unico su EBUSY/EPERM/EACCES (antivirus Windows).
 *
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ oldPath?: unknown, newName?: unknown }} payload
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
      await fsp.rename(oldPath, dest.destPath);
    } catch (firstErr) {
      if (firstErr.code === 'EBUSY' || firstErr.code === 'EPERM' || firstErr.code === 'EACCES') {
        logger.warn(`[IPC] rename-file ${firstErr.code} su "${oldPath}", retry dopo 150ms`);
        await sleep(150);
        await fsp.rename(oldPath, dest.destPath);
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
 * Allinea il tema delle finestre native (dialoghi, menu) a light/dark/system.
 *
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {unknown} source
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
 * Percorso fisico del file di log.
 *
 * @returns {Promise<string>}
 */
ipcMain.handle('app:get-log-path', async () => {
  const logPath = getLogFilePath();
  logger.info(`[IPC] Richiesta percorso file di log: "${logPath}"`);
  return logPath;
});

/**
 * Testo del README incluso nell'applicazione.
 *
 * @returns {Promise<{success: boolean, path?: string, content?: string, error?: string}>}
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
 * Apre README.md con l'applicazione predefinita del sistema.
 *
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
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
 * Esporta il report dei duplicati in JSON o CSV.
 *
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ format?: unknown, groups?: unknown }} payload
 * @returns {Promise<{success: boolean, canceled?: boolean, path?: string, error?: string}>}
 */
ipcMain.handle('report:export', async (_event, payload) => {
  const format = payload && payload.format === 'csv' ? 'csv' : 'json';
  const groups = payload && Array.isArray(payload.groups) ? payload.groups : [];
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
    if (!savePath) {
      return { success: false, error: 'Percorso di salvataggio non valido' };
    }

    if (format === 'csv') {
      let csvContent = 'Gruppo,Hash,Dimensione_Byte,Dimensione_Leggibile,Percorso_File,Data_Modifica\n';
      groups.forEach((g) => {
        const files = Array.isArray(g.files) ? g.files : [];
        files.forEach((f) => {
          const escPath = `"${String((f && f.path) || '').replace(/"/g, '""')}"`;
          const escHash = `"${String((g && g.hash) || '').replace(/"/g, '""')}"`;
          const readableSize = formatBytes(g && g.size);
          csvContent += `${g.groupId},${escHash},${g.size},"${readableSize}",${escPath},"${(f && f.mtimeDate) || ''}"\n`;
        });
      });
      await fsp.writeFile(savePath, csvContent, 'utf-8');
    } else {
      const jsonContent = JSON.stringify({
        exportedAt: new Date().toISOString(),
        groupCount: groups.length,
        groups
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

/**
 * Cambio lingua: ricostruisce la barra nativa. `handle` (non `on`) così
 * il Renderer attende l'esito e non accumula listener bidirezionali.
 *
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {unknown} lang
 * @returns {Promise<{success: boolean, language?: string, error?: string}>}
 */
ipcMain.handle('language-changed', async (_event, lang) => {
  logger.info(`[IPC] language-changed ricevuto dal Renderer: "${lang}"`);
  try {
    const applied = createNativeMenu(lang, nativeMenuActions());
    return { success: true, language: applied };
  } catch (err) {
    logger.error(`[IPC] Aggiornamento menu nativo fallito: ${err.message}`);
    return { success: false, error: err.message };
  }
});

/**
 * Log del Renderer verso il file persistente. Resta `send`/`on` perché è
 * fire-and-forget (un `invoke` per ogni riga di log appesantirebbe l'UI).
 * Un solo listener di processo: `ipcMain.on` non si ri-registra al reload.
 *
 * @param {Electron.IpcMainEvent} _event
 * @param {{ level?: unknown, message?: unknown }} payload
 * @returns {void}
 */
ipcMain.on('log:renderer', (_event, payload) => {
  const level = payload && payload.level;
  const message = payload && payload.message;
  const validLevel = ['info', 'warn', 'error', 'debug'].includes(level) ? level : 'info';
  logger[validLevel](`[RendererUI] ${message}`);
});
