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
