/**
 * @file main.js
 * @description Processo Principale (Main Process) di DupFinder in Electron.
 * Gestisce il ciclo di vita dell'applicazione desktop, l'apertura delle finestre native,
 * il routing IPC sicuro con il Renderer Process, la registrazione dei log su file persistente
 * e l'esecuzione asincrona del motore di ricerca duplicati.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { logger, logSystemInfo, getLogFilePath } = require('./src/logger');
const { ScanCancellationToken, findDuplicates, normalizeCrossPlatformPath } = require('./src/scanner');
const { loadReadme, resolveReadmePath } = require('./src/readme');
const { createNativeMenu } = require('./src/nativeMenu');

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
    height: 780,
    minWidth: 850,
    minHeight: 600,
    title: 'DupFinder - Trova File Duplicati',
    // Icona dell'applicazione (cross-platform con fallback su icon.png o icon.svg)
    icon: path.join(__dirname, 'build', 'icon.png'),
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
  logger.info(`[Main] Caricamento interfaccia utente da: "${indexPath}"`);
  mainWindow.loadFile(indexPath);

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
 * Inizializzazione dell'applicazione Electron al completamento dell'evento 'ready'.
 */
app.whenReady().then(() => {
  logSystemInfo();
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
 * Avvio asincrono della scansione per la ricerca dei duplicati.
 */
ipcMain.handle('scan:start', async (_event, payload) => {
  const { directories, criteria } = payload;
  logger.info(`[IPC] Avvio richiesta scansione su ${directories ? directories.length : 0} cartelle`);

  if (!directories || directories.length === 0) {
    logger.warn('[IPC] Nessuna cartella valida ricevuta per la scansione');
    throw new Error('Specificare almeno una cartella da scansionare');
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
      title: `Esporta Report DupFinder (${format.toUpperCase()})`,
      defaultPath: `dupfinder-report.${ext}`,
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
