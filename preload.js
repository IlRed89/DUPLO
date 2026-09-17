/**
 * @file preload.js
 * @description Ponte sicuro tra Main Process e Renderer (`contextIsolation: true`).
 *
 * Espone `window.duploAPI` (API completa) e l'alias `window.api` richiesto
 * dal contratto drag & drop (`getPathForFile`, `consumeDroppedPaths`,
 * `validateAndAddFolder`).
 *
 * Perché i path si catturano QUI e non nel Renderer:
 * `contextBridge` clona gli argomenti. Un `File` HTML5 clonato perde il
 * riferimento nativo e `webUtils.getPathForFile` restituisce `''`.
 * Il listener `drop` in capture sul mondo isolato vede il `File` vero.
 */

'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * Path catturati nel mondo isolato del preload (File nativo, non clonato).
 * Il Renderer li legge con `consumeDroppedPaths` e lo stash si svuota.
 * @type {string[]}
 */
let lastNativeDropPaths = [];

/**
 * Percorso filesystem di un `File` HTML5.
 * Da Electron 32+ `file.path` è vuoto con `contextIsolation`: serve
 * `webUtils.getPathForFile(file)` sul riferimento vivo.
 *
 * @param {File|null|undefined} file File del DataTransfer.
 * @returns {string} Percorso assoluto, oppure `''`.
 */
function getPathForFileSafe(file) {
  if (!file) {
    return '';
  }
  try {
    if (webUtils && typeof webUtils.getPathForFile === 'function') {
      const nativePath = webUtils.getPathForFile(file);
      if (typeof nativePath === 'string' && nativePath.length > 0) {
        return nativePath;
      }
    }
  } catch (_err) {
    /* File clonato o webUtils assente */
  }
  try {
    if (typeof file.path === 'string' && file.path.length > 0) {
      return file.path;
    }
  } catch (_err) {
    /* getter path bloccato */
  }
  return '';
}

/**
 * Estrae i path nativi da `dataTransfer.files` e `dataTransfer.items`.
 * Va chiamato in modo sincrono durante l'evento `drop` (la FileList svanisce).
 *
 * @param {DataTransfer|null|undefined} dataTransfer
 * @returns {string[]}
 */
function extractPathsFromDataTransfer(dataTransfer) {
  const paths = [];
  const seen = new Set();

  /**
   * @param {File|null} file
   * @returns {void}
   */
  function pushFile(file) {
    if (!file) {
      return;
    }
    const nativePath = getPathForFileSafe(file);
    if (!nativePath || seen.has(nativePath)) {
      return;
    }
    seen.add(nativePath);
    paths.push(nativePath);
  }

  try {
    const files = dataTransfer && dataTransfer.files ? dataTransfer.files : null;
    if (files && files.length) {
      for (let i = 0; i < files.length; i += 1) {
        pushFile(files[i]);
      }
    }
  } catch (_err) {
    /* FileList illeggibile */
  }

  try {
    const items = dataTransfer && dataTransfer.items ? dataTransfer.items : null;
    if (items && items.length) {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item && item.kind === 'file' && typeof item.getAsFile === 'function') {
          pushFile(item.getAsFile());
        }
      }
    }
  } catch (_err) {
    /* items illeggibile */
  }

  return paths;
}

/**
 * Invia un log al Main senza attendere ack (canale `log:renderer`).
 *
 * @param {string} level
 * @param {string} message
 * @returns {void}
 */
function logPreloadDrop(level, message) {
  try {
    ipcRenderer.send('log:renderer', { level: level || 'info', message: String(message) });
  } catch (_err) {
    /* logger non pronto */
  }
}

/**
 * Intercetta dragover/drop nel mondo isolato.
 * `preventDefault` senza `stopPropagation` sul dragover: in Chromium
 * `stopPropagation` sul dragover impedisce all'evento `drop` di sparare.
 *
 * @returns {void}
 */
function armIsolatedWorldDropCapture() {
  const opts = { capture: true };

  /**
   * @param {DragEvent} event
   * @returns {void}
   */
  function allowDrop(event) {
    try {
      event.preventDefault();
      if (event.dataTransfer) {
        try {
          event.dataTransfer.dropEffect = 'copy';
        } catch (_err) {
          /* ignore */
        }
      }
    } catch (_err) {
      /* ignore */
    }
  }

  window.addEventListener('dragenter', allowDrop, opts);
  window.addEventListener('dragover', allowDrop, opts);
  window.addEventListener('drop', (event) => {
    allowDrop(event);
    try {
      lastNativeDropPaths = extractPathsFromDataTransfer(event.dataTransfer);
      logPreloadDrop('info', `[Preload drop] catturati ${lastNativeDropPaths.length} path nativi (webUtils)`);
    } catch (err) {
      lastNativeDropPaths = [];
      logPreloadDrop('error', `[Preload drop] estrazione path fallita: ${err && err.message}`);
    }
  }, opts);
}

armIsolatedWorldDropCapture();

/**
 * Restituisce e svuota lo stash dei path nativi catturati al drop.
 *
 * @returns {string[]}
 */
function consumeDroppedPaths() {
  const copy = lastNativeDropPaths.slice();
  lastNativeDropPaths = [];
  return copy;
}

/**
 * Path nativo di un File. Stesso helper usato da `duploAPI` e `api`.
 *
 * @param {File} file
 * @returns {string}
 */
function getPathForFileBridge(file) {
  try {
    if (webUtils && typeof webUtils.getPathForFile === 'function') {
      const nativePath = webUtils.getPathForFile(file);
      if (typeof nativePath === 'string' && nativePath.length > 0) {
        return nativePath;
      }
    }
  } catch (_err) {
    /* File clonato dal contextBridge */
  }
  return getPathForFileSafe(file);
}

/**
 * Sottoscrive un canale Main→Renderer e restituisce l'unsubscribe.
 * Il Renderer deve chiamare l'unsubscribe al teardown (qui: una volta a boot).
 *
 * @param {string} channel
 * @param {function(...unknown): void} callback
 * @returns {function(): void}
 */
function subscribeChannel(channel, callback) {
  const subscription = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, subscription);
  return () => {
    ipcRenderer.removeListener(channel, subscription);
  };
}

contextBridge.exposeInMainWorld('duploAPI', {
  /**
   * Dialog nativo "Seleziona cartella".
   * @returns {Promise<string|null>}
   */
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),

  /**
   * Percorso nativo di un File droppato (`webUtils.getPathForFile`).
   * @param {File} file
   * @returns {string}
   */
  getPathForFile: (file) => getPathForFileBridge(file),

  /**
   * Path catturati dal listener `drop` del preload. Svuota lo stash.
   * @returns {string[]}
   */
  consumeDroppedPaths,

  /**
   * Verifica un singolo path droppato nel Main (`stat` + `isDirectory`).
   * @param {string} folderPath
   * @returns {Promise<{ok: boolean, directory: string|null, skipped: {path: string, reason: string}|null}>}
   */
  validateAndAddFolder: (folderPath) => ipcRenderer.invoke('validate-and-add-folder', folderPath),

  /**
   * Verifica in batch quali path droppati sono cartelle.
   * @param {string[]} paths
   * @returns {Promise<{directories: string[], skipped: Array<{path: string, reason: string}>}>}
   */
  filterDirectories: (paths) => ipcRenderer.invoke('fs:filter-directories', paths),

  /**
   * Avvia la scansione dei duplicati.
   * @param {{ directories: string[], criteria: Object }} payload
   * @returns {Promise<Array<Object>>}
   */
  startScan: (payload) => ipcRenderer.invoke('scan:start', payload),

  /**
   * Interrompe la scansione in corso.
   * @returns {Promise<boolean>}
   */
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),

  /**
   * Elimina un file dal disco (`unlink`).
   * @param {string} filePath
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  deleteFile: (filePath) => ipcRenderer.invoke('file:delete', filePath),

  /**
   * Apre la cartella contenitore nel file manager nativo.
   * @param {string} filePath
   * @returns {Promise<boolean>}
   */
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),

  /**
   * Rinomina un file nella stessa cartella.
   * @param {string} oldPath
   * @param {string} newName
   * @returns {Promise<{success: boolean, oldPath?: string, newPath?: string, error?: string, code?: string}>}
   */
  renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', {
    oldPath: oldPath == null ? '' : String(oldPath),
    newName: newName == null ? '' : String(newName)
  }),

  /**
   * Imposta il tema nativo Electron: `dark` | `light` | `system`.
   * @param {'dark'|'light'|'system'} source
   * @returns {Promise<{success: boolean, themeSource?: string, shouldUseDarkColors?: boolean, error?: string}>}
   */
  setNativeTheme: (source) => ipcRenderer.invoke('set-native-theme', source),

  /**
   * Percorso del file di log persistente.
   * @returns {Promise<string>}
   */
  getLogPath: () => ipcRenderer.invoke('app:get-log-path'),

  /**
   * Carica il manuale README.md.
   * @returns {Promise<{success: boolean, path?: string, content?: string, error?: string}>}
   */
  getReadme: () => ipcRenderer.invoke('app:get-readme'),

  /**
   * Apre README.md con il visualizzatore di sistema.
   * @returns {Promise<{success: boolean, path?: string, error?: string}>}
   */
  openReadme: () => ipcRenderer.invoke('app:open-readme'),

  /**
   * Log persistente (fire-and-forget).
   * @param {string} level
   * @param {string} message
   * @returns {void}
   */
  logRendererEvent: (level, message) => ipcRenderer.send('log:renderer', { level, message }),

  /**
   * Ricostruisce il menu nativo nella lingua indicata (`invoke`, attende l'esito).
   * @param {string} lang `it` | `en`
   * @returns {Promise<{success: boolean, language?: string, error?: string}>}
   */
  setLanguage: (lang) => ipcRenderer.invoke('language-changed', lang),

  /**
   * Voce nativa Aiuto → Guida (F1). Restituisce l'unsubscribe.
   * @param {function(): void} callback
   * @returns {function(): void}
   */
  onOpenGuideFromMenu: (callback) => subscribeChannel('menu:open-guide', () => callback()),

  /**
   * Progresso scansione in tempo reale. Restituisce l'unsubscribe.
   * @param {function(Object): void} callback
   * @returns {function(): void}
   */
  onScanProgress: (callback) => subscribeChannel('scan:progress', (data) => callback(data))
});

/**
 * Alias richiesto dal contratto drop: `window.api.getPathForFile(file)`.
 * Stesso helper di `window.duploAPI` (un solo ponte, due nomi).
 */
contextBridge.exposeInMainWorld('api', {
  getPathForFile: (file) => getPathForFileBridge(file),
  consumeDroppedPaths,
  validateAndAddFolder: (folderPath) => ipcRenderer.invoke('validate-and-add-folder', folderPath)
});
