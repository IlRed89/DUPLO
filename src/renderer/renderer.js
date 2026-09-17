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
  pendingModalAction: null,
  /** Percorsi dei file spuntati per la selezione multipla. */
  selectedPaths: {},
  /** Macro-sezioni risultati compresse (`hash`/`size`/`name`/`fuzzy` → true). */
  collapsedReasons: {}
};

/** Chiavi `localStorage` (allineate a `i18n.js` / script inline in `index.html`). */
const LANG_STORAGE_KEY = 'duplo.lang';
const THEME_STORAGE_KEY = 'duplo.theme';
/** Ordine delle sezioni a destra (allineato al motore di scansione). */
const MATCH_REASON_ORDER = ['hash', 'size', 'name', 'fuzzy'];

/**
 * Traduce una chiave UI. Fallback italiano se i18n non è ancora caricato.
 *
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
function t(key, vars) {
  try {
    if (window.DuploI18n && typeof window.DuploI18n.t === 'function') {
      return window.DuploI18n.t(key, vars);
    }
  } catch (_err) {
    /* ignore */
  }
  return String(key || '');
}

/**
 * Legge una preferenza da `localStorage` senza far saltare l'init.
 *
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function readStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value == null || value === '' ? fallback : value;
  } catch (_err) {
    return fallback;
  }
}

/**
 * Persiste una preferenza in `localStorage`.
 *
 * @param {string} key
 * @param {string} value
 * @returns {void}
 */
function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    logToMain('warn', 'localStorage non disponibile: ' + (err && err.message));
  }
}

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
  selectTheme: document.getElementById('selectTheme'),
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
  btnDeleteSelected: document.getElementById('btnDeleteSelected'),
  confirmModal: document.getElementById('confirmModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalMessage: document.getElementById('modalMessage'),
  btnModalCancel: document.getElementById('btnModalCancel'),
  btnModalConfirm: document.getElementById('btnModalConfirm'),
  dragOverlay: document.getElementById('drag-overlay')
};

document.addEventListener('DOMContentLoaded', function () {
  initPreferences().then(function () {
    logToMain('info', t('log.uiInit'));
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
    bindThemeSelector();
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
    if (dom.btnDeleteSelected) {
      dom.btnDeleteSelected.addEventListener('click', onDeleteSelectedClick);
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
        logToMain('info', t('log.guideFromMenu'));
        onShowGuideClick();
      });
    }
  }).catch(function (err) {
    logToMain('error', 'Init preferenze UI fallito: ' + (err && err.message));
  });
});

/**
 * Dialog nativo "Aggiungi Cartella".
 * @returns {Promise<void>}
 */
async function onAddFolderClick() {
  logToMain('info', t('log.addFolder'));
  try {
    const selected = await window.duploAPI.selectDirectory();
    if (!selected) {
      return;
    }
    if (state.selectedFolders.indexOf(selected) !== -1) {
      alert(t('alert.folderExists'));
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
  logToMain('info', t('log.folderAdded', { source: source, path: folderPath }));
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
    const empty = document.createElement('div');
    empty.className = 'empty-folders-hint';
    const line = document.createElement('span');
    line.setAttribute('data-i18n', 'folders.empty');
    line.textContent = t('folders.empty');
    empty.appendChild(line);
    empty.appendChild(document.createElement('br'));
    const hint = document.createElement('span');
    hint.className = 'drop-hint';
    hint.setAttribute('data-i18n', 'folders.dropHint');
    hint.textContent = t('folders.dropHint');
    empty.appendChild(hint);
    dom.folderListContainer.appendChild(empty);
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
    removeBtn.title = t('folders.removeOne');
    removeBtn.setAttribute('data-i18n-title', 'folders.removeOne');
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
      logToMain('info', t('log.filterToggled', {
        name: pair[1],
        state: el.checked ? t('log.filterOn') : t('log.filterOff')
      }));
    });
  });
  if (dom.selectHashAlgo) {
    dom.selectHashAlgo.addEventListener('change', function () {
      logToMain('info', t('log.hashAlgo', { algo: dom.selectHashAlgo.value }));
    });
  }
  if (dom.inputMinSize) {
    dom.inputMinSize.addEventListener('change', function () {
      logToMain('info', t('log.minSize', { value: dom.inputMinSize.value }));
    });
  }
}

/**
 * Carica i dizionari JSON, applica lingua e tema da `localStorage`,
 * notifica il Main (menu nativo + `nativeTheme.themeSource`).
 *
 * @returns {Promise<void>}
 */
async function initPreferences() {
  const i18n = window.DuploI18n;
  const langs = (i18n && i18n.SUPPORTED_LANGS) ? i18n.SUPPORTED_LANGS : ['it', 'en', 'es', 'fr'];
  try {
    const loaded = await Promise.all(langs.map(function (code) {
      return fetch('../locales/' + code + '.json')
        .then(function (res) {
          if (!res.ok) {
            throw new Error('HTTP ' + res.status);
          }
          return res.json();
        })
        .then(function (dict) {
          if (i18n && typeof i18n.registerDictionary === 'function') {
            i18n.registerDictionary(code, dict);
          }
          return code;
        })
        .catch(function (err) {
          logToMain('warn', 'Dizionario ' + code + ' non caricato: ' + (err && err.message));
          return null;
        });
    }));
    logToMain('info', 'Dizionari i18n caricati: ' + loaded.filter(Boolean).join(','));
  } catch (err) {
    logToMain('error', 'Caricamento i18n fallito: ' + (err && err.message));
  }

  const savedLang = (i18n && typeof i18n.normalizeLanguage === 'function')
    ? i18n.normalizeLanguage(readStorage(LANG_STORAGE_KEY, 'it'))
    : 'it';
  const savedTheme = readStorage(THEME_STORAGE_KEY, 'dark') === 'light' ? 'light' : 'dark';
  if (dom.selectLanguage) {
    dom.selectLanguage.value = savedLang;
  }
  if (dom.selectTheme) {
    dom.selectTheme.value = savedTheme;
  }
  applyLanguage(savedLang, { persist: false, skipRender: true });
  applyTheme(savedTheme, { persist: false });
}

/**
 * Applica la lingua a tutti i nodi `data-i18n*` e notifica il Main Process.
 *
 * @param {unknown} lang
 * @param {{ persist?: boolean, skipRender?: boolean }} [opts]
 * @returns {void}
 */
function applyLanguage(lang, opts) {
  const i18n = window.DuploI18n;
  const code = i18n && typeof i18n.normalizeLanguage === 'function'
    ? i18n.normalizeLanguage(lang)
    : 'it';
  if (i18n && typeof i18n.setLanguage === 'function') {
    i18n.setLanguage(code);
  }
  if (opts && opts.persist !== false) {
    writeStorage(LANG_STORAGE_KEY, code);
  }
  if (i18n && typeof i18n.applyToDocument === 'function') {
    const n = i18n.applyToDocument(document);
    logToMain('info', t('log.langRequested', { lang: code }) + ' (nodi=' + n + ')');
  }
  updateCategoryHint();
  renderFolderList();
  if (!opts || !opts.skipRender) {
    if (state.duplicateGroups.length > 0) {
      renderResults();
    } else if (dom.emptyPlaceholderTitle && !state.isScanning) {
      const scanned = state.totalFilesScanned > 0;
      dom.emptyPlaceholderTitle.textContent = scanned ? t('results.emptyNoneFound') : t('results.emptyTitle');
      if (dom.emptyPlaceholderText) {
        dom.emptyPlaceholderText.textContent = t('results.emptyText');
      }
    }
  }
  if (window.duploAPI && typeof window.duploAPI.setLanguage === 'function') {
    window.duploAPI.setLanguage(code).then(function (res) {
      if (res && res.success === false) {
        logToMain('error', t('log.langRejected', { error: res.error || 'sconosciuto' }));
      }
    }).catch(function (err) {
      logToMain('error', t('log.langFailed', { error: err.message }));
    });
  }
}

/**
 * Applica il tema chiaro/scuro (`html[data-theme]`) e notifica `nativeTheme`.
 *
 * @param {unknown} theme
 * @param {{ persist?: boolean }} [opts]
 * @returns {void}
 */
function applyTheme(theme, opts) {
  const source = String(theme || '').trim().toLowerCase() === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', source);
  if (opts && opts.persist !== false) {
    writeStorage(THEME_STORAGE_KEY, source);
  }
  logToMain('info', t('log.themeRequested', { theme: source }));
  if (window.duploAPI && typeof window.duploAPI.setNativeTheme === 'function') {
    window.duploAPI.setNativeTheme(source).then(function (res) {
      if (res && res.success === false) {
        logToMain('error', t('log.themeFailed', { error: res.error || 'sconosciuto' }));
      }
    }).catch(function (err) {
      logToMain('error', t('log.themeFailed', { error: err.message }));
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
      applyLanguage(dom.selectLanguage.value, { persist: true });
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
 * Selettore tema chiaro/scuro.
 * @returns {void}
 */
function bindThemeSelector() {
  if (!dom.selectTheme) {
    return;
  }
  dom.selectTheme.addEventListener('change', function () {
    applyTheme(dom.selectTheme.value, { persist: true });
  });
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
  const exts = api && typeof api.getCategoryExtensions === 'function'
    ? api.getCategoryExtensions(id)
    : [];
  if (!exts || exts.length === 0) {
    dom.categoryHint.textContent = t('filters.categoryHintAll');
    return;
  }
  dom.categoryHint.textContent = t('filters.categoryHintExts', { exts: exts.join(', ') });
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
      alert(t('alert.dropNoPath'));
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
      alert(t('alert.dropNoFolder'));
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
      alert(t('alert.resetBusy'));
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
    state.selectedPaths = {};
    if (dom.emptyPlaceholderTitle) {
      dom.emptyPlaceholderTitle.textContent = t('results.emptyTitle');
    }
    if (dom.emptyPlaceholderText) {
      dom.emptyPlaceholderText.textContent = t('results.emptyText');
    }
    logToMain('info', t('log.reset'));
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
        logToMain('info', t('log.advancedToggle', {
          state: dom.advancedSearchPanel.open ? t('log.advancedOpen') : t('log.advancedClosed')
        }));
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
  logToMain('info', t('log.scanStart'));
  if (state.selectedFolders.length === 0) {
    alert(t('alert.needFolder'));
    return;
  }
  const criteria = collectScanCriteria();
  if (!criteria) {
    alert(t('alert.needCriteria'));
    return;
  }
  handleScanProgress.lastPhase = null;
  state.isScanning = true;
  state.duplicateGroups = [];
  state.selectedPaths = {};
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
    alert(t('alert.scanError', { error: err.message }));
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
      dom.progressPhaseText.querySelector('span').textContent = t('progress.collecting');
    }
    if (dom.progressStatusDetail) {
      dom.progressStatusDetail.textContent = t('progress.collectingDetail', {
        count: data.filesCount || 0,
        file: data.currentFile || ''
      });
    }
  } else if (data.phase === 'grouping') {
    if (dom.progressTrack) {
      dom.progressTrack.className = 'progress-track indeterminate';
    }
    if (dom.progressPhaseText && dom.progressPhaseText.querySelector('span')) {
      dom.progressPhaseText.querySelector('span').textContent = t('progress.grouping');
    }
  } else if (data.phase === 'hashing') {
    if (dom.progressTrack) {
      dom.progressTrack.className = 'progress-track';
    }
    const total = data.totalToHash || 1;
    const current = data.hashedCount || 0;
    const percent = Math.min(100, Math.round((current / total) * 100));
    if (dom.progressPhaseText && dom.progressPhaseText.querySelector('span')) {
      dom.progressPhaseText.querySelector('span').textContent = t('progress.hashing');
    }
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
/**
 * Nome file da un path OS (senza Node `path`).
 *
 * @param {unknown} filePath
 * @returns {string}
 */
function fileNameFromPath(filePath) {
  const s = String(filePath || '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? s.slice(i + 1) : s;
}

/**
 * Directory padre di un path OS.
 *
 * @param {unknown} filePath
 * @returns {string}
 */
function dirNameFromPath(filePath) {
  const s = String(filePath || '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? s.slice(0, i) : '';
}

/**
 * Raggruppa i cluster per `matchReason` nell'ordine hash → size → name → fuzzy.
 *
 * @param {Array<Object>} groups
 * @returns {Array<{ reason: string, groups: Array<Object> }>}
 */
function groupResultsByMatchReason(groups) {
  const buckets = {};
  MATCH_REASON_ORDER.forEach(function (reason) {
    buckets[reason] = [];
  });
  (groups || []).forEach(function (group) {
    const reason = MATCH_REASONS_SAFE(group && group.matchReason);
    buckets[reason].push(group);
  });
  return MATCH_REASON_ORDER.filter(function (reason) {
    return buckets[reason].length > 0;
  }).map(function (reason) {
    return { reason: reason, groups: buckets[reason] };
  });
}

/**
 * @param {unknown} reason
 * @returns {'hash'|'size'|'name'|'fuzzy'}
 */
function MATCH_REASONS_SAFE(reason) {
  const value = String(reason || '');
  return MATCH_REASON_ORDER.indexOf(value) !== -1 ? value : 'size';
}

/**
 * Disegna i gruppi duplicati sezionati per criterio di rilevamento.
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
      dom.emptyPlaceholderTitle.textContent = t('results.emptyNoneFound');
    }
    if (dom.emptyPlaceholderText) {
      dom.emptyPlaceholderText.textContent = t('results.emptyText');
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

  const sections = groupResultsByMatchReason(state.duplicateGroups);
  const host = dom.resultsList || dom.resultsScrollContainer;
  sections.forEach(function (section) {
    host.appendChild(buildReasonSection(section.reason, section.groups));
  });
}

/**
 * Costruisce una macro-sezione collassabile per un criterio di matching.
 *
 * @param {string} reason
 * @param {Array<Object>} groups
 * @returns {HTMLElement}
 */
function buildReasonSection(reason, groups) {
  const section = document.createElement('section');
  const collapsed = !!state.collapsedReasons[reason];
  section.className = 'reason-section' + (collapsed ? ' is-collapsed' : '');
  section.dataset.reason = reason;

  let fileCount = 0;
  groups.forEach(function (g) {
    fileCount += Array.isArray(g.files) ? g.files.length : 0;
  });

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'reason-section-header';
  header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  header.title = collapsed ? t('reason.expand') : t('reason.collapse');

  const titleWrap = document.createElement('div');
  titleWrap.className = 'reason-section-title';
  const title = document.createElement('strong');
  title.textContent = t('reason.' + reason);
  const desc = document.createElement('span');
  desc.textContent = t('reason.' + reason + 'Desc');
  titleWrap.appendChild(title);
  titleWrap.appendChild(desc);

  const meta = document.createElement('div');
  meta.className = 'reason-section-meta';
  const count = document.createElement('span');
  count.className = 'reason-section-count';
  count.textContent = t('reason.counts', { groups: groups.length, files: fileCount });
  const chevron = document.createElement('span');
  chevron.className = 'reason-section-toggle';
  chevron.textContent = collapsed ? '▸' : '▾';
  meta.appendChild(count);
  meta.appendChild(chevron);

  header.appendChild(titleWrap);
  header.appendChild(meta);
  header.addEventListener('click', function () {
    state.collapsedReasons[reason] = !state.collapsedReasons[reason];
    logToMain('info', t('log.sectionToggle', {
      reason: reason,
      state: state.collapsedReasons[reason] ? t('log.sectionCollapsed') : t('log.sectionExpanded')
    }));
    renderResults();
  });

  const body = document.createElement('div');
  body.className = 'reason-section-body';

  const selectRow = document.createElement('label');
  selectRow.className = 'reason-section-select';
  const selectAll = document.createElement('input');
  selectAll.type = 'checkbox';
  selectAll.className = 'file-check';
  selectAll.title = t('results.selectSection');
  selectAll.addEventListener('click', function (event) {
    event.stopPropagation();
  });
  selectAll.addEventListener('change', function () {
    groups.forEach(function (group) {
      (group.files || []).forEach(function (file, idx) {
        if (idx === 0) {
          return;
        }
        if (selectAll.checked) {
          state.selectedPaths[file.path] = true;
        } else {
          delete state.selectedPaths[file.path];
        }
      });
    });
    renderResults();
  });
  const selectLbl = document.createElement('span');
  selectLbl.textContent = t('results.selectSection');
  selectRow.appendChild(selectAll);
  selectRow.appendChild(selectLbl);
  body.appendChild(selectRow);

  groups.forEach(function (group, groupIdx) {
    body.appendChild(buildDuplicateCard(group, groupIdx));
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
}

/**
 * Card di un set identico (originale + duplicati) dentro una macro-sezione.
 *
 * @param {Object} group
 * @param {number} groupIdx
 * @returns {HTMLElement}
 */
function buildDuplicateCard(group, groupIdx) {
  const card = document.createElement('div');
  card.className = 'duplicate-group-card';
  const header = document.createElement('div');
  header.className = 'group-header';

  const info = document.createElement('div');
  info.className = 'group-info';
  const badge = document.createElement('span');
  badge.className = 'group-badge';
  badge.textContent = t('results.group', { n: group.groupId || (groupIdx + 1) });
  const each = document.createElement('span');
  each.textContent = t('results.each', { size: formatBytes(group.size) });
  info.appendChild(badge);
  info.appendChild(each);

  const groupSelect = document.createElement('label');
  groupSelect.className = 'reason-section-select';
  const groupCb = document.createElement('input');
  groupCb.type = 'checkbox';
  groupCb.className = 'file-check';
  groupCb.title = t('results.selectGroup');
  groupCb.addEventListener('change', function () {
    (group.files || []).forEach(function (file, idx) {
      if (idx === 0) {
        return;
      }
      if (groupCb.checked) {
        state.selectedPaths[file.path] = true;
      } else {
        delete state.selectedPaths[file.path];
      }
    });
    renderResults();
  });
  const groupLbl = document.createElement('span');
  groupLbl.textContent = t('results.selectGroup');
  groupSelect.appendChild(groupCb);
  groupSelect.appendChild(groupLbl);

  const wasted = document.createElement('div');
  wasted.className = 'group-wasted';
  wasted.textContent = t('results.waste', { size: formatBytes(group.wastedBytes) });

  header.appendChild(info);
  header.appendChild(groupSelect);
  header.appendChild(wasted);

  const list = document.createElement('div');
  list.className = 'group-files-list';
  (group.files || []).forEach(function (file, fIdx) {
    list.appendChild(buildFileRow(group, file, fIdx));
  });
  card.appendChild(header);
  card.appendChild(list);
  return card;
}

/**
 * Riga file: checkbox, tag originale/duplicato, path, mtime, Apri, Rinomina, Elimina.
 *
 * @param {Object} group
 * @param {Object} file
 * @param {number} fileIndex
 * @returns {HTMLElement}
 */
function buildFileRow(group, file, fileIndex) {
  const isOriginal = fileIndex === 0;
  const row = document.createElement('div');
  row.className = 'file-row' + (isOriginal ? ' is-original' : '');

  const main = document.createElement('div');
  main.className = 'file-main-info';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'file-check';
  cb.title = t('results.selectFile');
  cb.checked = !!state.selectedPaths[file.path];
  cb.disabled = isOriginal;
  cb.addEventListener('change', function () {
    if (cb.checked) {
      state.selectedPaths[file.path] = true;
    } else {
      delete state.selectedPaths[file.path];
    }
  });
  main.appendChild(cb);

  const tag = document.createElement('span');
  tag.className = 'file-tag ' + (isOriginal ? 'tag-original' : 'tag-duplicate');
  tag.textContent = isOriginal ? t('results.original') : t('results.duplicate');
  main.appendChild(tag);

  const pathEl = document.createElement('span');
  pathEl.className = 'file-path-text';
  pathEl.title = file.path;
  pathEl.textContent = file.path;
  pathEl.addEventListener('click', function () {
    openFilePath(file.path);
  });
  main.appendChild(pathEl);

  const meta = document.createElement('div');
  meta.className = 'file-meta';
  const mtime = document.createElement('span');
  mtime.className = 'file-mtime';
  mtime.textContent = file.mtimeMs ? new Date(file.mtimeMs).toLocaleString() : '';
  meta.appendChild(mtime);

  const actions = document.createElement('div');
  actions.className = 'file-row-actions';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn btn-secondary btn-sm';
  openBtn.textContent = t('results.openPath');
  openBtn.addEventListener('click', function () {
    openFilePath(file.path);
  });
  actions.appendChild(openBtn);

  const renameBtn = document.createElement('button');
  renameBtn.type = 'button';
  renameBtn.className = 'btn btn-secondary btn-sm';
  renameBtn.textContent = t('results.rename');
  renameBtn.addEventListener('click', function () {
    askRenameFile(group, fileIndex);
  });
  actions.appendChild(renameBtn);

  if (!isOriginal) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-icon delete-hover btn-sm';
    del.textContent = t('results.delete');
    del.addEventListener('click', function () {
      askDeleteSingleFile(group, fileIndex);
    });
    actions.appendChild(del);
  }

  meta.appendChild(actions);
  row.appendChild(main);
  row.appendChild(meta);
  return row;
}

/**
 * Apre Esplora file / Finder sul file.
 *
 * @param {string} filePath
 * @returns {void}
 */
function openFilePath(filePath) {
  if (!filePath || !window.duploAPI || typeof window.duploAPI.showItemInFolder !== 'function') {
    return;
  }
  logToMain('info', 'Apri percorso: ' + filePath);
  window.duploAPI.showItemInFolder(filePath);
}

/**
 * Rinomina un file del gruppo tramite IPC `rename-file`.
 *
 * @param {Object} group
 * @param {number} fileIndex
 * @returns {Promise<void>}
 */
async function askRenameFile(group, fileIndex) {
  const file = group.files[fileIndex];
  const currentName = fileNameFromPath(file.path);
  const nextName = window.prompt(t('alert.renamePrompt'), currentName);
  if (nextName == null) {
    return;
  }
  const trimmed = String(nextName).trim();
  if (!trimmed || trimmed === currentName) {
    return;
  }
  try {
    const res = await window.duploAPI.renameFile(file.path, trimmed);
    if (!res || !res.success) {
      alert(t('alert.renameFail', { error: (res && res.error) || 'unknown' }));
      return;
    }
    const newPath = res.newPath || (dirNameFromPath(file.path) + '/' + trimmed);
    delete state.selectedPaths[file.path];
    file.path = newPath;
    file.name = fileNameFromPath(newPath);
    logToMain('info', 'File rinominato: ' + newPath);
    renderResults();
  } catch (err) {
    alert(t('alert.renameFail', { error: err.message }));
  }
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
    t('modal.deleteTitle'),
    t('modal.deleteBody', { path: '<br><code>' + escapeHtml(file.path) + '</code>' }),
    async function () {
      const res = await window.duploAPI.deleteFile(file.path);
      if (res.success) {
        delete state.selectedPaths[file.path];
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
        alert(t('alert.deleteFail', { error: res.error }));
      }
    }
  );
}

/**
 * Elimina i duplicati spuntati (mai l'originale di un gruppo).
 * @returns {void}
 */
function onDeleteSelectedClick() {
  const selected = Object.keys(state.selectedPaths).filter(function (p) {
    return state.selectedPaths[p];
  });
  if (selected.length === 0) {
    alert(t('alert.noSelection'));
    return;
  }
  openModal(
    t('modal.selectedTitle'),
    t('modal.selectedBody', { count: selected.length }),
    async function () {
      let deletedCount = 0;
      let errorCount = 0;
      for (let i = 0; i < selected.length; i += 1) {
        const filePath = selected[i];
        const res = await window.duploAPI.deleteFile(filePath);
        if (res && res.success) {
          deletedCount += 1;
          delete state.selectedPaths[filePath];
          state.duplicateGroups.forEach(function (group) {
            group.files = (group.files || []).filter(function (f) {
              return f.path !== filePath;
            });
            group.fileCount = group.files.length;
            group.wastedBytes = Math.max(0, group.fileCount - 1) * group.size;
          });
        } else {
          errorCount += 1;
        }
      }
      state.duplicateGroups = state.duplicateGroups.filter(function (g) {
        return g.files && g.files.length > 1;
      });
      renderResults();
      alert(t('alert.cleanDone', {
        deleted: deletedCount,
        errors: errorCount ? t('alert.cleanErrors', { count: errorCount }) : ''
      }));
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
    t('modal.batchTitle'),
    t('modal.batchBody', { count: totalFilesToDelete, size: formatBytes(totalBytesToFree) }),
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
            delete state.selectedPaths[file.path];
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
      alert(t('alert.cleanDone', {
        deleted: deletedCount,
        errors: errorCount ? t('alert.cleanErrors', { count: errorCount }) : ''
      }));
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
    alert(t('alert.exportEmpty'));
    return;
  }
  try {
    const res = await window.duploAPI.exportReport(format, state.duplicateGroups);
    if (res.success) {
      alert(t('alert.exportOk', { path: res.path }));
    } else if (!res.canceled) {
      alert(t('alert.exportFail', { error: res.error }));
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
    openModal(t('modal.logsTitle'), t('modal.logsBody', { path: '<br><code>' + escapeHtml(logPath) + '</code>' }), null);
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
    dom.guideContent.innerHTML = '<p class="guide-loading">' + escapeHtml(t('guide.loading')) + '</p>';
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
      dom.guideContent.innerHTML = '<p>' + escapeHtml(t('guide.error')) + '</p><p>' + escapeHtml(err.message) + '</p>';
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
      alert(t('alert.readmeFail', { error: res.error || 'file non trovato' }));
    }
  } catch (err) {
    alert(t('alert.readmeFail', { error: err.message }));
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
      dom.btnModalCancel.textContent = t('modal.close');
    }
  } else {
    if (dom.btnModalConfirm) {
      dom.btnModalConfirm.style.display = 'inline-flex';
    }
    if (dom.btnModalCancel) {
      dom.btnModalCancel.textContent = t('modal.cancel');
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
