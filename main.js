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

function packagedReadmeOptions() {
  return {
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    packaged: app.isPackaged
  };
}

let mainWindow = null;
let activeCancellationToken = null;

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

function createWindow() {
  logger.info('[Main] Creazione della finestra principale BrowserWindow');

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    minWidth: 920,
    minHeight: 700,
    title: 'DUPLO - Trova File Duplicati',
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
    mainWindow.webContents.setWindowOpenHandler((details) => {
      logger.warn(`[Main] Apertura finestra bloccata: ${(details && details.url) || ''}`);
      return { action: 'deny' };
    });
  } catch (err) {
    logger.warn(`[Main] setWindowOpenHandler fallito: ${err.message}`);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    logger.info('[Main] Finestra principale mostrata all\'utente');
  });

  mainWindow.on('closed', () => {
    logger.info('[Main] Finestra principale chiusa');
    mainWindow = null;
  });
}

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

app.whenReady().then(() => {
  logSystemInfo();
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

ipcMain.handle('scan:start', async (_event, payload) => {
  const { directories } = payload || {};
  logger.info(`[IPC] Avvio richiesta scansione su ${directories ? directories.length : 0} cartelle`);

  if (!directories || directories.length === 0) {
    logger.warn('[IPC] Nessuna cartella valida ricevuta per la scansione');
    throw new Error('Specificare almeno una cartella da scansionare');
  }

  const rawCriteria = (payload && payload.criteria) ? payload.criteria : {};
  let criteria = { ...rawCriteria };

  try {
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

ipcMain.handle('scan:cancel', async () => {
  logger.info('[IPC] Richiesta di interruzione scansione ricevuta dal Renderer');
  if (activeCancellationToken) {
    activeCancellationToken.cancel();
    return true;
  }
  return false;
});

ipcMain.handle('file:delete', async (_event, filePath) => {
  const normalized = normalizeCrossPlatformPath(filePath);
  logger.info(`[IPC] Richiesta eliminazione file: "${normalized}"`);

  try {
    await fsp.unlink(normalized);
    logger.info(`[IPC] File eliminato con successo: "${normalized}"`);
    return { success: true };
  } catch (err) {
    logger.error(`[IPC] Fallimento eliminazione file "${normalized}": [${err.code || 'UNKNOWN'}] ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('file:move', async (_event, { sourcePath, destFolder }) => {
  const normSource = normalizeCrossPlatformPath(sourcePath);
  const normDestDir = normalizeCrossPlatformPath(destFolder);
  const fileName = path.basename(normSource);
  const targetPath = path.join(normDestDir, fileName);

  logger.info(`[IPC] Richiesta spostamento file da "${normSource}" a "${targetPath}"`);

  try {
    await fsp.mkdir(normDestDir, { recursive: true });
    await fsp.rename(normSource, targetPath);
    logger.info(`[IPC] File spostato con successo in "${targetPath}"`);
    return { success: true };
  } catch (err) {
    logger.error(`[IPC] Fallimento spostamento file: [${err.code || 'UNKNOWN'}] ${err.message}`);
    return { success: false, error: err.message };
  }
});

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

const ALLOWED_NATIVE_THEMES = new Set(['dark', 'light', 'system']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

ipcMain.handle('app:get-log-path', async () => {
  const logPath = getLogFilePath();
  logger.info(`[IPC] Richiesta percorso file di log: "${logPath}"`);
  return logPath;
});

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

ipcMain.on('log:renderer', (_event, { level, message }) => {
  const validLevel = ['info', 'warn', 'error', 'debug'].includes(level) ? level : 'info';
  logger[validLevel](`[RendererUI] ${message}`);
});
