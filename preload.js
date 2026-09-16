/**
 * @file preload.js
 * @description Script di preload per Electron.
 * Utilizza contextBridge per esporre in modo sicuro un'API circoscritta (window.duploAPI)
 * al Renderer Process (interfaccia utente), mantenendo abilitato contextIsolation
 * e bloccando l'accesso diretto ai moduli nativi di Node.js.
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * Path catturati nel mondo isolato del preload (File nativo, non clonato).
 * `contextBridge` clona gli argomenti: passare `File` dal Renderer a
 * `getPathForFile` può restituire stringa vuota. Per questo il drop viene
 * intercettato QUI, su `window`, prima che l'oggetto attraversi il ponte.
 * @type {string[]}
 */
let lastNativeDropPaths = [];

/**
 * Percorso filesystem di un `File` HTML5. Da Electron 32+ `file.path` è
 * vuoto con `contextIsolation`: serve `webUtils.getPathForFile(file)`.
 *
 * @param {File} file File del DataTransfer (riferimento vivo).
 * @returns {string} Percorso assoluto, oppure ''.
 */
function getPathForFileSafe(file) {
  if (!file) return '';
  try {
    if (webUtils && typeof webUtils.getPathForFile === 'function') {
      const nativePath = webUtils.getPathForFile(file);
      if (typeof nativePath === 'string' && nativePath.length > 0) return nativePath;
    }
  } catch (_err) {
    /* File clonato o webUtils assente */
  }
  try {
    if (typeof file.path === 'string' && file.path.length > 0) return file.path;
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

  function pushFile(file) {
    if (!file) return;
    const nativePath = getPathForFileSafe(file);
    if (!nativePath || seen.has(nativePath)) return;
    seen.add(nativePath);
    paths.push(nativePath);
  }

  try {
    const files = dataTransfer && dataTransfer.files ? dataTransfer.files : null;
    if (files && files.length) {
      for (let i = 0; i < files.length; i += 1) pushFile(files[i]);
    }
  } catch (_err) { /* FileList illeggibile */ }

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
  } catch (_err) { /* items illeggibile */ }

  return paths;
}

function logPreloadDrop(level, message) {
  try {
    ipcRenderer.send('log:renderer', { level: level || 'info', message: String(message) });
  } catch (_err) { /* logger non pronto */ }
}

/**
 * Intercetta dragover/drop nel mondo isolato: preventDefault (senza
 * stopPropagation sul dragover: in Chromium bloccherebbe il drop) e
 * cattura i path con webUtils sul File nativo.
 */
function armIsolatedWorldDropCapture() {
  const opts = { capture: true };

  function allowDrop(event) {
    try {
      event.preventDefault();
      if (event.dataTransfer) {
        try { event.dataTransfer.dropEffect = 'copy'; } catch (_err) { /* ignore */ }
      }
    } catch (_err) { /* ignore */ }
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
 * Espone in modo sicuro i metodi e gli eventi IPC all'oggetto globale 'window.duploAPI'.
 */
contextBridge.exposeInMainWorld('duploAPI', {
  /**
   * Apre la finestra di dialogo nativa del sistema operativo per selezionare una cartella.
   * @returns {Promise<string|null>} Percorso della cartella selezionata o null se annullato
   */
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),

  /**
   * Percorso nativo di un File droppato (`webUtils.getPathForFile`).
   * Da chiamare nel Renderer come `window.duploAPI.getPathForFile(file)`
   * (alias richiesto: `window.api.getPathForFile`).
   * @param {File} file
   * @returns {string}
   */
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        const nativePath = webUtils.getPathForFile(file);
        if (typeof nativePath === 'string' && nativePath.length > 0) return nativePath;
      }
    } catch (_err) { /* File clonato dal contextBridge */ }
    return getPathForFileSafe(file);
  },

  /**
   * Path catturati dal listener `drop` del preload (File nativo).
   * Il Renderer li legge al drop e svuota lo stash.
   * @returns {string[]}
   */
  consumeDroppedPaths: () => {
    const copy = lastNativeDropPaths.slice();
    lastNativeDropPaths = [];
    return copy;
  },

  /**
   * Verifica un singolo path droppato nel Main (`fs.promises.stat` + `isDirectory`).
   * @param {string} folderPath
   * @returns {Promise<{ok: boolean, directory: string|null, skipped: {path: string, reason: string}|null}>}
   */
  validateAndAddFolder: (folderPath) => ipcRenderer.invoke('validate-and-add-folder', folderPath),

  /**
   * Verifica quali path droppati sono cartelle (stat nel Main Process).
   * @param {string[]} paths
   * @returns {Promise<{directories: string[], skipped: Array<{path: string, reason: string}>}>}
   */
  filterDirectories: (paths) => ipcRenderer.invoke('fs:filter-directories', paths),

  /**
   * Avvia la scansione dei duplicati con i percorsi e i criteri specificati.
   * @param {Object} payload - { directories: string[], criteria: Object }
   * @returns {Promise<Array<Object>>} Risultati dei gruppi duplicati
   */
  startScan: (payload) => ipcRenderer.invoke('scan:start', payload),

  /**
   * Richiede l'interruzione immediata della scansione in corso.
   * @returns {Promise<boolean>}
   */
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),

  /**
   * Elimina un file duplicato dal disco.
   * @param {string} filePath - Percorso assoluto del file da eliminare
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  deleteFile: (filePath) => ipcRenderer.invoke('file:delete', filePath),

  /**
   * Sposta un file in una cartella di destinazione.
   * @param {string} sourcePath - Percorso del file da spostare
   * @param {string} destFolder - Cartella dove collocare il file
   * @returns {Promise<{success: boolean, newPath?: string, error?: string}>}
   */
  moveFile: (sourcePath, destFolder) => ipcRenderer.invoke('file:move', { sourcePath, destFolder }),

  /**
   * Apre la cartella contenitore del file nel gestore file nativo del sistema (Explorer, Finder, Nautilus).
   * @param {string} filePath - Percorso del file da evidenziare
   * @returns {Promise<boolean>}
   */
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),

  /**
   * Rinomina un file sul disco (stessa cartella). Il Renderer aggiorna il DOM col newPath.
   * @param {string} oldPath - Percorso assoluto attuale
   * @param {string} newName - Nuovo nome file (basename; senza slash)
   * @returns {Promise<{success: boolean, oldPath?: string, newPath?: string, error?: string, code?: string}>}
   */
  renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', { oldPath, newName }),

  /**
   * Apre la cartella del file nel file manager nativo (`shell.showItemInFolder`).
   * @param {string} filePath
   * @returns {Promise<{success: boolean, path?: string, error?: string}>}
   */
  openFileLocation: (filePath) => ipcRenderer.invoke('open-file-location', filePath),

  /**
   * Imposta il tema delle finestre native Electron: 'dark' | 'light' | 'system'.
   * @param {'dark'|'light'|'system'} source
   * @returns {Promise<{success: boolean, themeSource?: string, shouldUseDarkColors?: boolean, error?: string}>}
   */
  setNativeTheme: (source) => ipcRenderer.invoke('set-native-theme', source),

  /**
   * Esporta il report dei risultati in JSON o CSV tramite dialogo di salvataggio.
   * @param {string} format - 'json' | 'csv'
   * @param {Array<Object>} groups - I gruppi di duplicati da esportare
   * @returns {Promise<{success: boolean, canceled?: boolean, path?: string, error?: string}>}
   */
  exportReport: (format, groups) => ipcRenderer.invoke('report:export', { format, groups }),

  /**
   * Restituisce il percorso fisico del file di log per agevolare il supporto e il debug.
   * @returns {Promise<string>}
   */
  getLogPath: () => ipcRenderer.invoke('app:get-log-path'),

  /**
   * Carica il manuale README.md incluso nell'applicazione.
   * @returns {Promise<{success: boolean, path?: string, content?: string, error?: string}>}
   */
  getReadme: () => ipcRenderer.invoke('app:get-readme'),

  /**
   * Apre il file README.md con il visualizzatore di testo del sistema.
   * @returns {Promise<{success: boolean, path?: string, error?: string}>}
   */
  openReadme: () => ipcRenderer.invoke('app:open-readme'),

  /**
   * Invia un messaggio di log dal Renderer al Main Process per memorizzarlo nel file di log.
   * @param {string} level - 'info' | 'warn' | 'error' | 'debug'
   * @param {string} message - Testo del log
   */
  logRendererEvent: (level, message) => ipcRenderer.send('log:renderer', { level, message }),

  /**
   * Chiede al Main Process di ricostruire la barra dei menu nativa nella lingua indicata.
   * @param {string} lang - 'it' | 'en' (altri valori: fallback italiano)
   */
  setLanguage: (lang) => ipcRenderer.send('language-changed', lang),

  /**
   * Sottoscrizione alla voce nativa Aiuto → Guida (F1).
   * @param {function(): void} callback
   * @returns {function(): void}
   */
  onOpenGuideFromMenu: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('menu:open-guide', subscription);
    return () => ipcRenderer.removeListener('menu:open-guide', subscription);
  },

  /**
   * Sottoscrizione agli aggiornamenti di progresso in tempo reale inviati dal Main Process.
   * @param {function(Object): void} callback - Funzione chiamata ad ogni avanzamento
   * @returns {function(): void} Funzione per rimuovere il listener
   */
  onScanProgress: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('scan:progress', subscription);
    return () => {
      ipcRenderer.removeListener('scan:progress', subscription);
    };
  }
});

/**
 * Alias richiesto dal contratto drop: `window.api.getPathForFile(file)`.
 * Stesso helper di `window.duploAPI` (un solo ponte, due nomi).
 */
contextBridge.exposeInMainWorld('api', {
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        const nativePath = webUtils.getPathForFile(file);
        if (typeof nativePath === 'string' && nativePath.length > 0) return nativePath;
      }
    } catch (_err) { /* File clonato */ }
    return getPathForFileSafe(file);
  },
  consumeDroppedPaths: () => {
    const copy = lastNativeDropPaths.slice();
    lastNativeDropPaths = [];
    return copy;
  },
  validateAndAddFolder: (folderPath) => ipcRenderer.invoke('validate-and-add-folder', folderPath)
});
