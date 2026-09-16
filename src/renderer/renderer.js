/**
 * @file renderer.js
 * @description Logica UI di DUPLO (Renderer Process, nessun modulo Node diretto).
 *
 * Tutto l'I/O disco passa da `window.duploAPI` (preload + IPC).
 * I moduli UMD (`DuploFormatBytes`, `DuploAdvancedFilters`, …) arrivano
 * come `<script>` prima di questo file.
 *
 * Contratto drag & drop (non modificare):
 * - path nativi da `consumeDroppedPaths` (preload, File vivo);
 * - fallback `getPathForFile` sul File HTML5;
 * - validazione cartella con `validateAndAddFolder`;
 * - `preventDefault` senza `stopPropagation` sul dragover;
 * - overlay con `pointer-events: none` e contatore anti-flicker.
 */

'use strict';

/**
 * Stato applicativo dell'interfaccia. Non è un store persistente:
 * un reset o una nuova scansione lo azzera in RAM.
 * @type {{
 *   selectedFolders: string[],
 *   isScanning: boolean,
 *   duplicateGroups: Array<Object>,
 *   totalFilesScanned: number,
 *   pendingModalAction: (function(): void)|null
 * }}
 */
const state = {
  selectedFolders: [],
  isScanning: false,
  duplicateGroups: [],
  totalFilesScanned: 0,
  pendingModalAction: null
};

/**
 * Invia un log al Main Process (file persistente). Fire-and-forget.
 *
 * @param {string} level `info` | `warn` | `error` | `debug`
 * @param {string} message
 * @returns {void}
 */
function logToMain(level, message) {
  try {
    if (window.duploAPI && typeof window.duploAPI.logRendererEvent === 'function') {
      window.duploAPI.logRendererEvent(level, message);
    }
  } catch (err) {
    console.error('Errore invio log al main:', err);
  }
}

/**
 * Riferimenti DOM risolti una sola volta. Null-safe: i bind controllano
 * l'esistenza così un HTML incompleto non rompe l'init.
 * @type {Record<string, HTMLElement|null>}
 */
const dom = {
  btnAddFolder: document.getElementById('btnAddFolder'),
  btnClearFolders: document.getElementById('btnClearFolders'),
  folderListContainer: document.getElementById('folderListContainer'),
  folderCountBadge: document.getElementById('folderCountBadge'),
  appBody: document.querySelector('.app-body'),
  sidebarPanel: document.querySelector('.sidebar-panel'),
  panelSplitter: document.getElementById('panelSplitter'),
  selectLanguage: document.getElementById('selectLanguage'),
  selectFileCategory: document.getElementById('selectFileCategory'),
  categoryHint: document.getElementById('categoryHint'),
  inputCustomExtensions: document.getElementById('inputCustomExtensions'),
  inputModifiedFrom: document.getElementById('inputModifiedFrom'),
  inputModifiedTo: document.getElementById('inputModifiedTo'),
  inputAdvMinSize: document.getElementById('inputAdvMinSize'),
  inputAdvMaxSize: document.getElementById('inputAdvMaxSize'),
  selectSizeUnit: document.getElementById('selectSizeUnit'),
  advancedSearchPanel: document.getElementById('advancedSearchPanel'),
  btnResetApp: document.getElementById('btnResetApp'),
  chkMatchSize: document.getElementById('chkMatchSize'),
  chkMatchHash: document.getElementById('chkMatchHash'),
  chkMatchName: document.getElementById('chkMatchName'),
  chkMatchFuzzyName: document.getElementById('chkMatchFuzzyName'),
  chkMatchExtension: document.getElementById('chkMatchExtension'),
  chkMatchDate: document.getElementById('chkMatchDate'),
  inputMinSize: document.getElementById('inputMinSize'),
  selectHashAlgo: document.getElementById('selectHashAlgo'),
  chkIncludeHidden: document.getElementById('chkIncludeHidden'),
  btnStartScan: document.getElementById('btnStartScan'),
  btnCancelScan: document.getElementById('btnCancelScan'),
  btnShowLogPath: document.getElementById('btnShowLogPath'),
  btnShowGuide: document.getElementById('btnShowGuide'),
  guideOverlay: document.getElementById('guideOverlay'),
  guideContent: document.getElementById('guideContent'),
  btnCloseGuide: document.getElementById('btnCloseGuide'),
  btnOpenReadmeFile: document.getElementById('btnOpenReadmeFile'),
  progressBarSection: document.getElementById('progressBarSection'),
  progressTrack: document.getElementById('progressTrack'),
  progressFillBar: document.getElementById('progressFillBar'),
  progressPhaseText: document.getElementById('progressPhaseText'),
  progressPercentText: document.getElementById('progressPercentText'),
  progressStatusDetail: document.getElementById('progressStatusDetail'),
  statsBanner: document.getElementById('statsBanner'),
  statFilesScanned: document.getElementById('statFilesScanned'),
  statGroupsCount: document.getElementById('statGroupsCount'),
  statDuplicatesCount: document.getElementById('statDuplicatesCount'),
  statWastedSpace: document.getElementById('statWastedSpace'),
  resultsToolbar: document.getElementById('resultsToolbar'),
  resultsScrollContainer: document.getElementById('resultsScrollContainer'),
  resultsList: document.getElementById('resultsList'),
  emptyPlaceholder: document.getElementById('emptyPlaceholder'),
  emptyPlaceholderTitle: document.getElementById('emptyPlaceholderTitle'),
  emptyPlaceholderText: document.getElementById('emptyPlaceholderText'),
  btnExportJSON: document.getElementById('btnExportJSON'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  btnBatchClean: document.getElementById('btnBatchClean'),
  confirmModal: document.getElementById('confirmModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalMessage: document.getElementById('modalMessage'),
  btnModalCancel: document.getElementById('btnModalCancel'),
  btnModalConfirm: document.getElementById('btnModalConfirm'),
  dragOverlay: document.getElementById('drag-overlay')
};

document.addEventListener('DOMContentLoaded', function () {
  logToMain('info', 'Interfaccia Renderer inizializzata con successo.');
  if (dom.btnAddFolder) {
    dom.btnAddFolder.addEventListener('click', onAddFolderClick);
  }
  if (dom.btnClearFolders) {
    dom.btnClearFolders.addEventListener('click', onClearFoldersClick);
  }
  bindCriteriaLogging();
  initSplitter();
  initFolderDropZone();
  bindLanguageAndCategory();
  bindAdvancedSearchLogging();
  if (dom.btnResetApp) {
    dom.btnResetApp.addEventListener('click', resetApp);
  }
  if (dom.btnStartScan) {
    dom.btnStartScan.addEventListener('click', onStartScanClick);
  }
  if (dom.btnCancelScan) {
    dom.btnCancelScan.addEventListener('click', onCancelScanClick);
  }
  if (dom.btnShowLogPath) {
    dom.btnShowLogPath.addEventListener('click', onShowLogPathClick);
  }
  if (dom.btnShowGuide) {
    dom.btnShowGuide.addEventListener('click', onShowGuideClick);
  }
  if (dom.btnCloseGuide) {
    dom.btnCloseGuide.addEventListener('click', closeGuide);
  }
  if (dom.btnOpenReadmeFile) {
    dom.btnOpenReadmeFile.addEventListener('click', onOpenReadmeFileClick);
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && dom.guideOverlay && !dom.guideOverlay.hidden) {
      closeGuide();
    }
  });
  if (dom.btnExportJSON) {
    dom.btnExportJSON.addEventListener('click', function () {
      onExportReport('json');
    });
  }
  if (dom.btnExportCSV) {
    dom.btnExportCSV.addEventListener('click', function () {
      onExportReport('csv');
    });
  }
  if (dom.btnBatchClean) {
    dom.btnBatchClean.addEventListener('click', onBatchCleanClick);
  }
  if (dom.btnModalCancel) {
    dom.btnModalCancel.addEventListener('click', closeModal);
  }
  if (dom.btnModalConfirm) {
    dom.btnModalConfirm.addEventListener('click', confirmModalAction);
  }
  if (window.duploAPI && typeof window.duploAPI.onScanProgress === 'function') {
    window.duploAPI.onScanProgress(handleScanProgress);
  }
  if (window.duploAPI && typeof window.duploAPI.onOpenGuideFromMenu === 'function') {
    window.duploAPI.onOpenGuideFromMenu(function () {
      logToMain('info', 'Guida aperta dalla barra dei menu nativa');
      onShowGuideClick();
    });
  }
});

/**
 * Dialog nativo "Aggiungi Cartella".
 * @returns {Promise<void>}
 */
async function onAddFolderClick() {
  logToMain('info', 'Utente ha cliccato Aggiungi Cartella');
  try {
    const selected = await window.duploAPI.selectDirectory();
    if (!selected) {
      return;
    }
    if (state.selectedFolders.indexOf(selected) !== -1) {
      alert('Questa cartella e gia presente nell elenco.');
      return;
    }
    addFolderPath(selected, 'dialogo nativo');
  } catch (err) {
    logToMain('error', 'Errore durante la selezione della cartella: ' + err.message);
  }
}

/**
 * Svuota l'elenco cartelle senza toccare i filtri.
 * @returns {void}
 */
function onClearFoldersClick() {
  if (state.selectedFolders.length === 0) {
    return;
  }
  state.selectedFolders = [];
  renderFolderList();
}

/**
 * Rimuove una cartella per indice.
 * @param {number} index
 * @returns {void}
 */
function removeFolder(index) {
  if (index >= 0 && index < state.selectedFolders.length) {
    state.selectedFolders.splice(index, 1);
    renderFolderList();
  }
}

/**
 * Aggiunge un path già validato (dialogo o drop). Deduplica per uguaglianza stringa.
 *
 * @param {string} folderPath
 * @param {string} source Etichetta di log (`dialogo nativo` / `drag & drop`).
 * @returns {void}
 */
function addFolderPath(folderPath, source) {
  if (!folderPath) {
    return;
  }
  if (state.selectedFolders.indexOf(folderPath) !== -1) {
    return;
  }
  state.selectedFolders.push(folderPath);
  logToMain('info', 'Cartella aggiunta tramite ' + source + ': ' + folderPath);
  renderFolderList();
}

/**
 * Ricostruisce la lista cartelle nel DOM.
 * @returns {void}
 */
function renderFolderList() {
  if (dom.folderCountBadge) {
    dom.folderCountBadge.textContent = '(' + state.selectedFolders.length + ')';
  }
  if (!dom.folderListContainer) {
    return;
  }
  dom.folderListContainer.innerHTML = '';
  if (state.selectedFolders.length === 0) {
    dom.folderListContainer.innerHTML =
      '<div class="empty-folders-hint">Nessuna cartella selezionata<br><span class="drop-hint">Trascina le cartelle ovunque nella finestra, o usa Aggiungi Cartella</span></div>';
    return;
  }
  state.selectedFolders.forEach(function (folder, idx) {
    const item = document.createElement('div');
    item.className = 'folder-item';
    const pathSpan = document.createElement('span');
    pathSpan.className = 'folder-path';
    pathSpan.title = folder;
    pathSpan.textContent = folder;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-folder';
    removeBtn.title = 'Rimuovi';
    removeBtn.textContent = 'x';
    removeBtn.onclick = function () {
      removeFolder(idx);
    };
    item.appendChild(pathSpan);
    item.appendChild(removeBtn);
    dom.folderListContainer.appendChild(item);
  });
}

/**
 * Logga i toggle dei criteri di confronto.
 * @returns {void}
 */
function bindCriteriaLogging() {
  const checkboxes = [
    ['chkMatchSize', 'Stessa Dimensione'],
    ['chkMatchHash', 'Hash Contenuto'],
    ['chkMatchName', 'Stesso Nome'],
    ['chkMatchFuzzyName', 'Nomi Simili (Fuzzy)'],
    ['chkMatchExtension', 'Stessa Estensione'],
    ['chkMatchDate', 'Stessa Data'],
    ['chkIncludeHidden', 'Includi nascosti']
  ];
  checkboxes.forEach(function (pair) {
    const el = dom[pair[0]];
    if (!el) {
      return;
    }
    el.addEventListener('change', function () {
      logToMain('info', 'Filtro ' + pair[1] + ' ' + (el.checked ? 'attivato' : 'disattivato'));
    });
  });
  if (dom.selectHashAlgo) {
    dom.selectHashAlgo.addEventListener('change', function () {
      logToMain('info', 'Algoritmo hash impostato a ' + dom.selectHashAlgo.value);
    });
  }
  if (dom.inputMinSize) {
    dom.inputMinSize.addEventListener('change', function () {
      logToMain('info', 'Dimensione minima impostata a ' + dom.inputMinSize.value + ' KB');
    });
  }
}

/**
 * Lingua del menu nativo + hint categoria file.
 * @returns {void}
 */
function bindLanguageAndCategory() {
  if (dom.selectLanguage) {
    dom.selectLanguage.addEventListener('change', function () {
      const lang = dom.selectLanguage.value;
      logToMain('info', 'Lingua UI richiesta: ' + lang);
      if (!window.duploAPI || typeof window.duploAPI.setLanguage !== 'function') {
        return;
      }
      window.duploAPI.setLanguage(lang).then(function (res) {
        if (res && res.success === false) {
          logToMain('error', 'Cambio lingua rifiutato: ' + (res.error || 'sconosciuto'));
        }
      }).catch(function (err) {
        logToMain('error', 'Cambio lingua fallito: ' + err.message);
      });
    });
  }
  if (dom.selectFileCategory) {
    updateCategoryHint();
    dom.selectFileCategory.addEventListener('change', function () {
      updateCategoryHint();
    });
  }
}

/**
 * Estensioni della categoria selezionata (array vuoto = tutti i tipi).
 * @returns {string[]}
 */
function getSelectedCategoryExtensions() {
  const api = window.DuploFileCategories;
  const id = (dom.selectFileCategory && dom.selectFileCategory.value) || 'all';
  if (api && typeof api.getCategoryExtensions === 'function') {
    return api.getCategoryExtensions(id);
  }
  return [];
}

/**
 * Aggiorna il testo di aiuto sotto la tendina categoria.
 * @returns {void}
 */
function updateCategoryHint() {
  if (!dom.categoryHint) {
    return;
  }
  const api = window.DuploFileCategories;
  const id = (dom.selectFileCategory && dom.selectFileCategory.value) || 'all';
  if (api && typeof api.formatCategoryHint === 'function') {
    dom.categoryHint.textContent = api.formatCategoryHint(id);
  }
}

/**
 * Splitter laterale: al drag, `newWidth = clamp(start + deltaX, MIN_SIDEBAR, body - MIN_MAIN)`.
 * I minimi vivono in `splitterMath.js` (testabili senza DOM).
 *
 * @returns {void}
 */
function initSplitter() {
  const splitter = dom.panelSplitter;
  const sidebar = dom.sidebarPanel;
  const bodyEl = dom.appBody;
  if (!splitter || !sidebar || !bodyEl) {
    return;
  }
  const math = window.DuploSplitterMath;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  splitter.addEventListener('mousedown', function (event) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    splitter.classList.add('is-dragging');
    document.body.classList.add('is-resizing');
  });

  document.addEventListener('mousemove', function (event) {
    if (!dragging) {
      return;
    }
    const deltaX = event.clientX - startX;
    const containerWidth = bodyEl.getBoundingClientRect().width;
    const next = math
      ? math.clampSidebarWidth(startWidth, deltaX, containerWidth)
      : startWidth + deltaX;
    sidebar.style.flexBasis = next + 'px';
    sidebar.style.width = next + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) {
      return;
    }
    dragging = false;
    splitter.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing');
  });
}

/**
 * Drop a tutta finestra.
 *
 * Contatore anti-flicker: `dragenter`/`dragleave` sparano anche quando il
 * puntatore entra in un *figlio* (il browser tratta ogni elemento come
 * enter/leave). Senza contatore l'overlay lampeggerebbe. Si incrementa su
 * enter, si decrementa su leave, si nasconde solo a 0.
 * L'overlay ha `pointer-events: none` così non genera enter/leave propri.
 *
 * @returns {void}
 */
function initFolderDropZone() {
  const overlay = dom.dragOverlay;
  let dragCounter = 0;
  let dragActive = false;
  const opts = { capture: true };

  /**
   * True se il dataTransfer contiene file (non testo/URL).
   * @param {DragEvent} event
   * @returns {boolean}
   */
  function isFileDrag(event) {
    try {
      const types = event && event.dataTransfer && event.dataTransfer.types;
      if (!types || types.length === 0) {
        return true;
      }
      if (typeof types.contains === 'function' && types.contains('Files')) {
        return true;
      }
      const arr = Array.from(types);
      return arr.indexOf('Files') !== -1 || arr.indexOf('application/x-moz-file') !== -1;
    } catch (_err) {
      return true;
    }
  }

  /**
   * preventDefault + dropEffect=copy. NON stopPropagation su dragover:
   * in Chromium/Electron bloccherebbe l'evento drop.
   *
   * @param {DragEvent} event
   * @returns {void}
   */
  function allowCopyDrop(event) {
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

  /**
   * @returns {void}
   */
  function showOverlay() {
    try {
      if (!dragActive) {
        dragActive = true;
        logToMain('info', 'Iniziato drag & drop');
      }
      if (overlay) {
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
      }
    } catch (err) {
      logToMain('error', 'showOverlay drop: ' + (err && err.message));
    }
  }

  /**
   * @returns {void}
   */
  function hideOverlay() {
    try {
      dragCounter = 0;
      dragActive = false;
      if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
      }
    } catch (err) {
      logToMain('error', 'hideOverlay drop: ' + (err && err.message));
    }
  }

  /**
   * @param {DragEvent} event
   * @returns {void}
   */
  function onDragEnter(event) {
    try {
      allowCopyDrop(event);
      if (!isFileDrag(event)) {
        return;
      }
      dragCounter += 1;
      showOverlay();
    } catch (err) {
      logToMain('error', 'dragenter fallito: ' + (err && err.message));
    }
  }

  /**
   * @param {DragEvent} event
   * @returns {void}
   */
  function onDragOver(event) {
    try {
      allowCopyDrop(event);
      if (isFileDrag(event) && !dragActive) {
        showOverlay();
      }
    } catch (err) {
      logToMain('error', 'dragover fallito: ' + (err && err.message));
    }
  }

  /**
   * @param {DragEvent} event
   * @returns {void}
   */
  function onDragLeave(event) {
    try {
      allowCopyDrop(event);
      dragCounter -= 1;
      if (dragCounter <= 0) {
        dragCounter = 0;
        hideOverlay();
      }
    } catch (err) {
      logToMain('error', 'dragleave fallito: ' + (err && err.message));
      hideOverlay();
    }
  }

  /**
   * Raccoglie i File HTML5 dal DataTransfer (deduplicati per name+size+mtime).
   * @param {DataTransfer|null} dataTransfer
   * @returns {File[]}
   */
  function collectDroppedFiles(dataTransfer) {
    const out = [];
    const seen = {};
    function add(file) {
      if (!file) {
        return;
      }
      const key = String(file.name || '') + ':' + String(file.size || 0) + ':' + String(file.lastModified || 0);
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      out.push(file);
    }
    try {
      if (dataTransfer && dataTransfer.files) {
        Array.from(dataTransfer.files).forEach(add);
      }
    } catch (_err) {
      /* ignore */
    }
    try {
      if (dataTransfer && dataTransfer.items) {
        Array.from(dataTransfer.items).forEach(function (item) {
          if (item && item.kind === 'file' && typeof item.getAsFile === 'function') {
            add(item.getAsFile());
          }
        });
      }
    } catch (_err) {
      /* ignore */
    }
    return out;
  }

  /**
   * Path nativi stashed dal preload (File vivo, non clonato).
   * @returns {string[]}
   */
  function consumeStashedPaths() {
    try {
      if (window.duploAPI && typeof window.duploAPI.consumeDroppedPaths === 'function') {
        return window.duploAPI.consumeDroppedPaths() || [];
      }
      if (window.api && typeof window.api.consumeDroppedPaths === 'function') {
        return window.api.consumeDroppedPaths() || [];
      }
    } catch (err) {
      logToMain('warn', 'consumeDroppedPaths fallito: ' + (err && err.message));
    }
    return [];
  }

  /**
   * @param {DragEvent} event
   * @returns {void}
   */
  function onDrop(event) {
    try {
      allowCopyDrop(event);
      try {
        event.stopPropagation();
      } catch (_err) {
        /* ignore */
      }
      const files = collectDroppedFiles(event.dataTransfer);
      const stashed = consumeStashedPaths();
      dragCounter = 0;
      hideOverlay();
      handleFolderDrop(files, stashed);
    } catch (err) {
      hideOverlay();
      logToMain('error', 'drop fallito: ' + (err && err.message));
    }
  }

  try {
    window.addEventListener('dragenter', onDragEnter, opts);
    window.addEventListener('dragover', onDragOver, opts);
    window.addEventListener('dragleave', onDragLeave, opts);
    window.addEventListener('drop', onDrop, opts);
    window.addEventListener('dragend', function () {
      hideOverlay();
    }, opts);
    if (document && document.addEventListener) {
      document.addEventListener('dragenter', allowCopyDrop, opts);
      document.addEventListener('dragover', allowCopyDrop, opts);
      document.addEventListener('drop', allowCopyDrop, opts);
    }
    if (overlay && overlay.addEventListener) {
      overlay.addEventListener('dragenter', allowCopyDrop, opts);
      overlay.addEventListener('dragover', allowCopyDrop, opts);
      overlay.addEventListener('drop', allowCopyDrop, opts);
    }
    logToMain('debug', 'Listener drag & drop globali installati su window, document e overlay.');
  } catch (err) {
    logToMain('error', 'Impossibile installare il drag & drop: ' + (err && err.message));
  }
}

/**
 * Path nativo di un File HTML5 via preload (`webUtils`). Fallback `file.path`.
 *
 * @param {File} file
 * @returns {string}
 */
function resolveDroppedFilePath(file) {
  try {
    const api = (window.duploAPI && window.duploAPI.getPathForFile)
      ? window.duploAPI
      : (window.api && window.api.getPathForFile ? window.api : null);
    if (api && typeof api.getPathForFile === 'function') {
      const fromNative = api.getPathForFile(file);
      if (typeof fromNative === 'string' && fromNative.length > 0) {
        return fromNative;
      }
    }
  } catch (err) {
    logToMain('warn', 'getPathForFile fallito: ' + (err && err.message));
  }
  try {
    if (file && typeof file.path === 'string' && file.path.length > 0) {
      return file.path;
    }
  } catch (_err) {
    /* ignore */
  }
  return '';
}

/**
 * Elabora un drop: unisce stash preload + File HTML5, valida ogni path
 * nel Main (`isDirectory`). I file singoli restano ignorati (non si prende
 * la cartella padre: rischierebbe di scansionare alberi enormi).
 *
 * @param {File[]} files
 * @param {string[]} stashedPaths
 * @returns {Promise<void>}
 */
async function handleFolderDrop(files, stashedPaths) {
  try {
    logToMain('info', 'Iniziato drag & drop (drop ricevuto)');
    const fileList = Array.isArray(files) ? files : [];
    const paths = [];
    const seen = {};

    /**
     * @param {string} nativePath
     * @returns {void}
     */
    function pushPath(nativePath) {
      if (!nativePath || seen[nativePath]) {
        return;
      }
      seen[nativePath] = true;
      paths.push(nativePath);
    }

    (Array.isArray(stashedPaths) ? stashedPaths : []).forEach(pushPath);
    for (let i = 0; i < fileList.length; i += 1) {
      pushPath(resolveDroppedFilePath(fileList[i]));
    }

    logToMain('info', 'Drop: ' + fileList.length + ' File HTML5, ' + paths.length + ' path nativi');
    if (paths.length === 0) {
      logToMain('warn', 'Drop ignorato: nessun percorso nativo (webUtils.getPathForFile / stash preload)');
      alert('Impossibile leggere il percorso delle cartelle. Trascina da Esplora file sopra la finestra di DUPLO.');
      return;
    }

    let added = 0;
    let validatedDirs = 0;
    for (let i = 0; i < paths.length; i += 1) {
      const droppedPath = paths[i];
      logToMain('debug', 'Drop path nativo: ' + droppedPath);
      let result = null;
      try {
        if (window.duploAPI && typeof window.duploAPI.validateAndAddFolder === 'function') {
          result = await window.duploAPI.validateAndAddFolder(droppedPath);
        } else if (window.api && typeof window.api.validateAndAddFolder === 'function') {
          result = await window.api.validateAndAddFolder(droppedPath);
        }
      } catch (err) {
        logToMain('error', 'validate-and-add-folder fallito per «' + droppedPath + '»: ' + (err && err.message));
        continue;
      }
      if (result && result.ok && result.directory) {
        validatedDirs += 1;
        const before = state.selectedFolders.length;
        addFolderPath(result.directory, 'drag & drop');
        if (state.selectedFolders.length > before) {
          added += 1;
        }
      } else {
        const skipped = result && result.skipped ? result.skipped : { path: droppedPath, reason: 'non è una cartella' };
        logToMain('warn', 'Drop ignorato: non è una cartella (' + skipped.path + ' — ' + skipped.reason + ')');
      }
    }

    logToMain('info', 'Aggiunte ' + added + ' cartelle via drop (validate-and-add-folder, ' + validatedDirs + ' directory valide)');
    if (validatedDirs === 0) {
      alert('Nessuna cartella valida nel trascinamento. Trascina cartelle, non singoli file.');
    }
  } catch (err) {
    logToMain('error', 'Errore drag & drop: ' + err.message);
  }
}

/**
 * Legge i controlli UI e produce i criteri per `scan:start`.
 * Date vuote → 0 (nessun filtro), mai NaN. Almeno un criterio deve essere attivo.
 *
 * @returns {Object|null}
 */
function collectScanCriteria() {
  const filters = window.DuploAdvancedFilters;
  const categoryExts = getSelectedCategoryExtensions();
  const customExts = filters && typeof filters.parseExtensionList === 'function'
    ? filters.parseExtensionList(dom.inputCustomExtensions ? dom.inputCustomExtensions.value : '')
    : [];
  const resolved = filters && typeof filters.resolveIncludeExtensions === 'function'
    ? filters.resolveIncludeExtensions(customExts, categoryExts)
    : { includeExtensions: customExts.length ? customExts : categoryExts, usedCustom: customExts.length > 0 };
  const unit = (dom.selectSizeUnit && dom.selectSizeUnit.value) || 'kb';
  const simpleMinKb = parseInt(dom.inputMinSize && dom.inputMinSize.value, 10) || 0;
  let minSizeBytes = simpleMinKb * 1024;
  let maxSizeBytes = 0;
  if (filters && typeof filters.sizeToBytes === 'function') {
    const advMin = filters.sizeToBytes(dom.inputAdvMinSize && dom.inputAdvMinSize.value, unit);
    const advMax = filters.sizeToBytes(dom.inputAdvMaxSize && dom.inputAdvMaxSize.value, unit);
    if (advMin > 0) {
      minSizeBytes = Math.max(minSizeBytes, advMin);
    }
    maxSizeBytes = advMax;
  }
  const afterMs = filters && typeof filters.dateInputToMs === 'function'
    ? filters.dateInputToMs(dom.inputModifiedFrom && dom.inputModifiedFrom.value, false) : 0;
  const beforeMs = filters && typeof filters.dateInputToMs === 'function'
    ? filters.dateInputToMs(dom.inputModifiedTo && dom.inputModifiedTo.value, true) : 0;
  const range = filters && typeof filters.normalizeDateRange === 'function'
    ? filters.normalizeDateRange(afterMs, beforeMs)
    : { modifiedAfterMs: afterMs, modifiedBeforeMs: beforeMs, swapped: false };

  const criteria = {
    matchSize: !!(dom.chkMatchSize && dom.chkMatchSize.checked),
    matchHash: !!(dom.chkMatchHash && dom.chkMatchHash.checked),
    matchName: !!(dom.chkMatchName && dom.chkMatchName.checked),
    matchFuzzyName: !!(dom.chkMatchFuzzyName && dom.chkMatchFuzzyName.checked),
    matchExtension: !!(dom.chkMatchExtension && dom.chkMatchExtension.checked),
    matchDate: !!(dom.chkMatchDate && dom.chkMatchDate.checked),
    hashAlgorithm: (dom.selectHashAlgo && dom.selectHashAlgo.value) || 'sha256',
    minSizeBytes: minSizeBytes,
    maxSizeBytes: maxSizeBytes,
    includeExtensions: resolved.includeExtensions,
    customExtensions: customExts,
    excludeExtensions: [],
    includeHidden: !!(dom.chkIncludeHidden && dom.chkIncludeHidden.checked),
    modifiedAfterMs: range.modifiedAfterMs,
    modifiedBeforeMs: range.modifiedBeforeMs
  };

  const anyCriterion = criteria.matchSize || criteria.matchHash || criteria.matchName
    || criteria.matchFuzzyName || criteria.matchExtension || criteria.matchDate;
  if (!anyCriterion) {
    return null;
  }
  return criteria;
}

/**
 * Azzera cartelle, filtri e risultati senza chiudere l'app.
 * @returns {void}
 */
function resetApp() {
  try {
    if (state.isScanning) {
      alert('Interrompi la scansione prima di azzerare filtri e ricerca.');
      return;
    }
    state.selectedFolders = [];
    state.duplicateGroups = [];
    state.totalFilesScanned = 0;
    renderFolderList();
    if (dom.chkMatchSize) {
      dom.chkMatchSize.checked = true;
    }
    if (dom.chkMatchHash) {
      dom.chkMatchHash.checked = true;
    }
    if (dom.chkMatchName) {
      dom.chkMatchName.checked = false;
    }
    if (dom.chkMatchFuzzyName) {
      dom.chkMatchFuzzyName.checked = false;
    }
    if (dom.chkMatchExtension) {
      dom.chkMatchExtension.checked = false;
    }
    if (dom.chkMatchDate) {
      dom.chkMatchDate.checked = false;
    }
    if (dom.chkIncludeHidden) {
      dom.chkIncludeHidden.checked = false;
    }
    if (dom.inputMinSize) {
      dom.inputMinSize.value = '0';
    }
    if (dom.selectHashAlgo) {
      dom.selectHashAlgo.value = 'sha256';
    }
    if (dom.selectFileCategory) {
      dom.selectFileCategory.value = 'all';
    }
    updateCategoryHint();
    if (dom.inputCustomExtensions) {
      dom.inputCustomExtensions.value = '';
    }
    if (dom.inputModifiedFrom) {
      dom.inputModifiedFrom.value = '';
    }
    if (dom.inputModifiedTo) {
      dom.inputModifiedTo.value = '';
    }
    if (dom.inputAdvMinSize) {
      dom.inputAdvMinSize.value = '';
    }
    if (dom.inputAdvMaxSize) {
      dom.inputAdvMaxSize.value = '';
    }
    if (dom.selectSizeUnit) {
      dom.selectSizeUnit.value = 'kb';
    }
    if (dom.advancedSearchPanel) {
      dom.advancedSearchPanel.open = false;
    }
    if (dom.resultsList) {
      dom.resultsList.innerHTML = '';
    }
    if (dom.statsBanner) {
      dom.statsBanner.style.display = 'none';
    }
    if (dom.resultsToolbar) {
      dom.resultsToolbar.style.display = 'none';
    }
    if (dom.progressBarSection) {
      dom.progressBarSection.style.display = 'none';
    }
    if (dom.emptyPlaceholder) {
      dom.emptyPlaceholder.style.display = 'flex';
    }
    if (dom.emptyPlaceholderTitle) {
      dom.emptyPlaceholderTitle.textContent = 'Nessuna scansione eseguita';
    }
    logToMain('info', 'Applicazione resettata dall utente');
  } catch (err) {
    logToMain('error', 'Reset applicazione fallito: ' + err.message);
  }
}

/**
 * Logga apertura/chiusura del pannello Ricerca Avanzata.
 * @returns {void}
 */
function bindAdvancedSearchLogging() {
  try {
    if (dom.advancedSearchPanel) {
      dom.advancedSearchPanel.addEventListener('toggle', function () {
        logToMain('info', 'Ricerca Avanzata ' + (dom.advancedSearchPanel.open ? 'aperta' : 'chiusa'));
      });
    }
  } catch (err) {
    logToMain('error', 'bindAdvancedSearchLogging: ' + err.message);
  }
}

/**
 * Avvia la scansione. Cartelle e criteri vuoti si intercettano qui
 * (alert), così il Main non riceve Promise rejection inutili.
 *
 * @returns {Promise<void>}
 */
async function onStartScanClick() {
  logToMain('info', 'Utente ha cliccato Avvia Scansione');
  if (state.selectedFolders.length === 0) {
    alert('Seleziona almeno una cartella da scansionare prima di procedere.');
    return;
  }
  const criteria = collectScanCriteria();
  if (!criteria) {
    alert('Attiva almeno un parametro di confronto (consigliati: Stessa Dimensione + Hash Contenuto).');
    return;
  }
  handleScanProgress.lastPhase = null;
  state.isScanning = true;
  state.duplicateGroups = [];
  state.totalFilesScanned = 0;
  if (dom.btnStartScan) {
    dom.btnStartScan.disabled = true;
  }
  if (dom.btnCancelScan) {
    dom.btnCancelScan.style.display = 'inline-flex';
  }
  if (dom.progressBarSection) {
    dom.progressBarSection.style.display = 'flex';
  }
  if (dom.progressTrack) {
    dom.progressTrack.className = 'progress-track indeterminate';
  }
  if (dom.progressFillBar) {
    dom.progressFillBar.style.width = '0%';
  }
  if (dom.emptyPlaceholder) {
    dom.emptyPlaceholder.style.display = 'none';
  }
  try {
    const results = await window.duploAPI.startScan({
      directories: state.selectedFolders.slice(),
      criteria: criteria
    });
    state.duplicateGroups = results || [];
    renderResults();
  } catch (err) {
    logToMain('error', 'Errore durante la scansione: ' + err.message);
    alert('Errore durante la scansione: ' + err.message);
  } finally {
    state.isScanning = false;
    if (dom.btnStartScan) {
      dom.btnStartScan.disabled = false;
    }
    if (dom.btnCancelScan) {
      dom.btnCancelScan.style.display = 'none';
    }
    if (dom.progressBarSection) {
      dom.progressBarSection.style.display = 'none';
    }
  }
}

/**
 * Richiede l'interruzione cooperativa della scansione.
 * @returns {Promise<void>}
 */
async function onCancelScanClick() {
  try {
    await window.duploAPI.cancelScan();
  } catch (err) {
    logToMain('error', 'Errore interruzione scansione: ' + err.message);
  }
}

/**
 * Aggiorna la progress bar. `collecting`/`grouping` sono indeterminati
 * (non sappiamo quanti file ci sono); `hashing` ha un totale noto.
 *
 * @param {Object} data
 * @returns {void}
 */
function handleScanProgress(data) {
  if (!data) {
    return;
  }
  if (data.filesCount) {
    state.totalFilesScanned = data.filesCount;
  }
  if (data.phase && data.phase !== handleScanProgress.lastPhase) {
    handleScanProgress.lastPhase = data.phase;
  }
  if (data.phase === 'collecting') {
    if (dom.progressTrack) {
      dom.progressTrack.className = 'progress-track indeterminate';
    }
    if (dom.progressPhaseText && dom.progressPhaseText.querySelector('span')) {
      dom.progressPhaseText.querySelector('span').textContent = 'Raccolta e indicizzazione file...';
    }
    if (dom.progressStatusDetail) {
      dom.progressStatusDetail.textContent = (data.filesCount || 0) + ' file trovati: ' + (data.currentFile || '');
    }
  } else if (data.phase === 'grouping') {
    if (dom.progressTrack) {
      dom.progressTrack.className = 'progress-track indeterminate';
    }
    if (dom.progressPhaseText && dom.progressPhaseText.querySelector('span')) {
      dom.progressPhaseText.querySelector('span').textContent = 'Filtro e raggruppamento preliminare...';
    }
  } else if (data.phase === 'hashing') {
    if (dom.progressTrack) {
      dom.progressTrack.className = 'progress-track';
    }
    const total = data.totalToHash || 1;
    const current = data.hashedCount || 0;
    const percent = Math.min(100, Math.round((current / total) * 100));
    if (dom.progressFillBar) {
      dom.progressFillBar.style.width = percent + '%';
    }
    if (dom.progressPercentText) {
      dom.progressPercentText.textContent = percent + '%';
    }
    if (dom.progressStatusDetail) {
      dom.progressStatusDetail.textContent = data.currentFile || '';
    }
  }
}

/**
 * Disegna i gruppi duplicati e le statistiche.
 * @returns {void}
 */
function renderResults() {
  if (dom.resultsList) {
    dom.resultsList.innerHTML = '';
  }
  if (state.duplicateGroups.length === 0) {
    if (dom.statsBanner) {
      dom.statsBanner.style.display = 'none';
    }
    if (dom.resultsToolbar) {
      dom.resultsToolbar.style.display = 'none';
    }
    if (dom.emptyPlaceholder) {
      dom.emptyPlaceholder.style.display = 'flex';
    }
    if (dom.emptyPlaceholderTitle) {
      dom.emptyPlaceholderTitle.textContent = 'Nessun duplicato trovato';
    }
    return;
  }

  let totalDuplicates = 0;
  let totalWastedBytes = 0;
  state.duplicateGroups.forEach(function (g) {
    totalDuplicates += (g.fileCount - 1);
    totalWastedBytes += g.wastedBytes;
  });

  if (dom.statFilesScanned) {
    dom.statFilesScanned.textContent = state.totalFilesScanned || '-';
  }
  if (dom.statGroupsCount) {
    dom.statGroupsCount.textContent = String(state.duplicateGroups.length);
  }
  if (dom.statDuplicatesCount) {
    dom.statDuplicatesCount.textContent = String(totalDuplicates);
  }
  if (dom.statWastedSpace) {
    dom.statWastedSpace.textContent = formatBytes(totalWastedBytes);
  }
  if (dom.statsBanner) {
    dom.statsBanner.style.display = 'grid';
  }
  if (dom.resultsToolbar) {
    dom.resultsToolbar.style.display = 'flex';
  }
  if (dom.emptyPlaceholder) {
    dom.emptyPlaceholder.style.display = 'none';
  }

  state.duplicateGroups.forEach(function (group, groupIdx) {
    const card = document.createElement('div');
    card.className = 'duplicate-group-card';
    const header = document.createElement('div');
    header.className = 'group-header';
    header.innerHTML = '<div class="group-info"><span class="group-badge">Gruppo #' + (groupIdx + 1) +
      '</span><span>' + formatBytes(group.size) + ' ciascuno</span></div><div class="group-wasted">Spreco: ' +
      formatBytes(group.wastedBytes) + '</div>';
    const list = document.createElement('div');
    list.className = 'group-files-list';
    group.files.forEach(function (file, fIdx) {
      const isOriginal = (fIdx === 0);
      const row = document.createElement('div');
      row.className = 'file-row' + (isOriginal ? ' is-original' : '');
      const dateStr = new Date(file.mtimeMs).toLocaleString();
      row.innerHTML = '<div class="file-main-info"><span class="file-tag ' +
        (isOriginal ? 'tag-original' : 'tag-duplicate') + '">' +
        (isOriginal ? 'Originale' : 'Duplicato') + '</span><span class="file-path-text">' +
        escapeHtml(file.path) + '</span></div><div class="file-meta"><span>' + dateStr + '</span></div>';
      const pathEl = row.querySelector('.file-path-text');
      if (pathEl) {
        pathEl.addEventListener('click', function () {
          window.duploAPI.showItemInFolder(file.path);
        });
      }
      if (!isOriginal) {
        const del = document.createElement('button');
        del.className = 'btn-icon delete-hover';
        del.textContent = 'Elimina';
        del.addEventListener('click', function () {
          askDeleteSingleFile(group, fIdx);
        });
        row.querySelector('.file-meta').appendChild(del);
      }
      list.appendChild(row);
    });
    card.appendChild(header);
    card.appendChild(list);
    (dom.resultsList || dom.resultsScrollContainer).appendChild(card);
  });
}

/**
 * Chiede conferma e elimina un singolo duplicato.
 *
 * @param {Object} group
 * @param {number} fileIndex
 * @returns {void}
 */
function askDeleteSingleFile(group, fileIndex) {
  const file = group.files[fileIndex];
  openModal(
    'Elimina File Duplicato',
    'Sei sicuro di voler eliminare definitivamente:<br><code>' + escapeHtml(file.path) + '</code>',
    async function () {
      const res = await window.duploAPI.deleteFile(file.path);
      if (res.success) {
        group.files.splice(fileIndex, 1);
        group.fileCount--;
        group.wastedBytes = (group.fileCount - 1) * group.size;
        if (group.files.length <= 1) {
          state.duplicateGroups = state.duplicateGroups.filter(function (g) {
            return g.groupId !== group.groupId;
          });
        }
        renderResults();
      } else {
        alert('Impossibile eliminare il file: ' + res.error);
      }
    }
  );
}

/**
 * Elimina tutti i duplicati (tiene il primo file di ogni gruppo).
 * @returns {void}
 */
function onBatchCleanClick() {
  if (state.duplicateGroups.length === 0) {
    return;
  }
  let totalFilesToDelete = 0;
  let totalBytesToFree = 0;
  state.duplicateGroups.forEach(function (g) {
    totalFilesToDelete += (g.fileCount - 1);
    totalBytesToFree += g.wastedBytes;
  });
  openModal(
    'Pulizia Rapida Duplicati',
    'Eliminera ' + totalFilesToDelete + ' file duplicati. Spazio: ' + formatBytes(totalBytesToFree),
    async function () {
      let deletedCount = 0;
      let errorCount = 0;
      const groupsCopy = state.duplicateGroups.slice();
      for (let gi = 0; gi < groupsCopy.length; gi++) {
        const group = groupsCopy[gi];
        for (let i = group.files.length - 1; i >= 1; i--) {
          const file = group.files[i];
          const res = await window.duploAPI.deleteFile(file.path);
          if (res.success) {
            deletedCount++;
            group.files.splice(i, 1);
          } else {
            errorCount++;
          }
        }
      }
      state.duplicateGroups = state.duplicateGroups.filter(function (g) {
        return g.files.length > 1;
      });
      renderResults();
      alert('Pulizia completata! ' + deletedCount + ' file eliminati.' + (errorCount ? ' Errori: ' + errorCount : ''));
    }
  );
}

/**
 * Esporta JSON o CSV tramite dialogo nativo di salvataggio.
 *
 * @param {string} format
 * @returns {Promise<void>}
 */
async function onExportReport(format) {
  if (state.duplicateGroups.length === 0) {
    alert('Nessun risultato da esportare.');
    return;
  }
  try {
    const res = await window.duploAPI.exportReport(format, state.duplicateGroups);
    if (res.success) {
      alert('Report esportato in:\n' + res.path);
    } else if (!res.canceled) {
      alert('Errore esportazione report: ' + res.error);
    }
  } catch (err) {
    logToMain('error', 'Errore esportazione: ' + err.message);
  }
}

/**
 * Mostra il percorso del file di log.
 * @returns {Promise<void>}
 */
async function onShowLogPathClick() {
  try {
    const logPath = await window.duploAPI.getLogPath();
    openModal('File di Log di DUPLO', 'File di log:<br><code>' + escapeHtml(logPath) + '</code>', null);
  } catch (err) {
    console.error('Errore percorso log:', err);
  }
}

/**
 * Apre la guida in-app (README renderizzato).
 * @returns {Promise<void>}
 */
async function onShowGuideClick() {
  if (!dom.guideOverlay) {
    return;
  }
  dom.guideOverlay.hidden = false;
  if (dom.guideContent && dom.guideContent.dataset.loaded === '1') {
    return;
  }
  if (dom.guideContent) {
    dom.guideContent.innerHTML = '<p class="guide-loading">Caricamento del manuale…</p>';
  }
  try {
    const res = await window.duploAPI.getReadme();
    if (!res.success) {
      throw new Error(res.error || 'README non disponibile');
    }
    const toHtml = (window.DuploMarkdown && window.DuploMarkdown.markdownToHtml)
      ? window.DuploMarkdown.markdownToHtml
      : function (text) {
        return '<pre>' + escapeHtml(text) + '</pre>';
      };
    if (dom.guideContent) {
      dom.guideContent.innerHTML = toHtml(res.content);
      dom.guideContent.dataset.loaded = '1';
    }
  } catch (err) {
    if (dom.guideContent) {
      dom.guideContent.innerHTML = '<p>Impossibile caricare il manuale README.</p><p>' + escapeHtml(err.message) + '</p>';
    }
  }
}

/**
 * Chiude il pannello guida.
 * @returns {void}
 */
function closeGuide() {
  if (dom.guideOverlay) {
    dom.guideOverlay.hidden = true;
  }
}

/**
 * Apre README.md con l'editor di sistema.
 * @returns {Promise<void>}
 */
async function onOpenReadmeFileClick() {
  try {
    const res = await window.duploAPI.openReadme();
    if (!res.success) {
      alert('Impossibile aprire README.md:\n' + (res.error || 'file non trovato'));
    }
  } catch (err) {
    alert('Impossibile aprire README.md:\n' + err.message);
  }
}

/**
 * Apre la modale di conferma. Se `confirmAction` è null è solo informativa.
 *
 * @param {string} title
 * @param {string} messageHtml
 * @param {(function(): void)|null} confirmAction
 * @returns {void}
 */
function openModal(title, messageHtml, confirmAction) {
  if (dom.modalTitle) {
    dom.modalTitle.textContent = title;
  }
  if (dom.modalMessage) {
    dom.modalMessage.innerHTML = messageHtml;
  }
  state.pendingModalAction = confirmAction;
  if (!confirmAction) {
    if (dom.btnModalConfirm) {
      dom.btnModalConfirm.style.display = 'none';
    }
    if (dom.btnModalCancel) {
      dom.btnModalCancel.textContent = 'Chiudi';
    }
  } else {
    if (dom.btnModalConfirm) {
      dom.btnModalConfirm.style.display = 'inline-flex';
    }
    if (dom.btnModalCancel) {
      dom.btnModalCancel.textContent = 'Annulla';
    }
  }
  if (dom.confirmModal) {
    dom.confirmModal.style.display = 'flex';
  }
}

/**
 * Chiude la modale senza eseguire l'azione.
 * @returns {void}
 */
function closeModal() {
  if (dom.confirmModal) {
    dom.confirmModal.style.display = 'none';
  }
  state.pendingModalAction = null;
}

/**
 * Esegue l'azione pendente della modale.
 * @returns {void}
 */
function confirmModalAction() {
  if (typeof state.pendingModalAction === 'function') {
    const action = state.pendingModalAction;
    closeModal();
    action();
  } else {
    closeModal();
  }
}

/**
 * Formattazione byte unificata (`src/formatBytes.js`).
 *
 * @param {unknown} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (window.DuploFormatBytes && typeof window.DuploFormatBytes.formatBytes === 'function') {
    return window.DuploFormatBytes.formatBytes(bytes);
  }
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(k)));
  return (n / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * Escape HTML per path e messaggi inseriti nel DOM.
 *
 * @param {unknown} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) {
    return '';
  }
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
