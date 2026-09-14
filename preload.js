/**
 * @file preload.js
 * @description Script di preload per Electron.
 * Utilizza contextBridge per esporre in modo sicuro un'API circoscritta (window.dupFinderAPI)
 * al Renderer Process (interfaccia utente), mantenendo abilitato contextIsolation
 * e bloccando l'accesso diretto ai moduli nativi di Node.js.
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Espone in modo sicuro i metodi e gli eventi IPC all'oggetto globale 'window.dupFinderAPI'.
 */
contextBridge.exposeInMainWorld('dupFinderAPI', {
  /**
   * Apre la finestra di dialogo nativa del sistema operativo per selezionare una cartella.
   * @returns {Promise<string|null>} Percorso della cartella selezionata o null se annullato
   */
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),

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
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  moveFile: (sourcePath, destFolder) => ipcRenderer.invoke('file:move', { sourcePath, destFolder }),

  /**
   * Apre la cartella contenitore del file nel gestore file nativo del sistema (Explorer, Finder, Nautilus).
   * @param {string} filePath - Percorso del file da evidenziare
   * @returns {Promise<boolean>}
   */
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),

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
