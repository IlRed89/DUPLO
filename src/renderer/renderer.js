/**
 * @file renderer.js
 * @description Logica UI di DUPLO (Renderer Process, nessun modulo Node diretto).
 *
 * Tutto l'I/O disco passa da `window.duploAPI` (preload + IPC).
 * I moduli UMD arrivano come `<script>` prima di questo file.
 * I bind successivi vivono in prefsView / dropView / filtersView / actionsView
 * (stesso scope globale: `state`, `dom`, `t`, `uiAlert`).
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
 *   totalFilesScanned: number
 * }}
 */
const state = {
  selectedFolders: [],
  isScanning: false,
  duplicateGroups: [],
  totalFilesScanned: 0,
  /** Percorsi dei file spuntati per la selezione multipla. */
  selectedPaths: {},
  /** Macro-sezioni risultati compresse (firma AND dei criteri → true). */
  collapsedReasons: {}
};

/** Chiavi `localStorage` (allineate a `i18n.js` / script inline in `index.html`). */
const LANG_STORAGE_KEY = 'duplo.lang';
const THEME_STORAGE_KEY = 'duplo.theme';
/** Ordine canonico dei criteri (allineato a `scanner.js` / i18n). */
const MATCH_REASON_ORDER = ['hash', 'size', 'name', 'fuzzy', 'extension', 'date'];

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
 * Avviso / errore a tema. Sostituisce `alert()` nativo.
 *
 * @param {string} message
 * @param {'info'|'warning'|'error'} [kind='warning']
 * @param {string} [title]
 * @returns {Promise<{ ok: boolean, value: string }>}
 */
function uiAlert(message, kind, title) {
  const k = kind || 'warning';
  const heading = title || (k === 'error'
    ? t('modal.errorTitle')
    : (k === 'info' ? t('modal.infoTitle') : t('modal.warningTitle')));
  logToMain('info', '[Dialog] alert kind=' + k + ' title="' + heading + '"');
  if (!window.DuploDialog || typeof window.DuploDialog.alert !== 'function') {
    logToMain('error', 'DuploDialog assente: ' + String(message || ''));
    return Promise.resolve({ ok: false, value: '' });
  }
  return window.DuploDialog.alert({
    kind: k,
    title: heading,
    message: String(message || '')
  });
}

/**
 * Conferma a tema (HTML consentito nel corpo). Sostituisce `confirm()`.
 *
 * @param {string} title
 * @param {string} messageHtml
 * @param {string} [confirmLabel]
 * @returns {Promise<boolean>}
 */
function uiConfirm(title, messageHtml, confirmLabel) {
  logToMain('info', '[Dialog] confirm title="' + title + '"');
  if (!window.DuploDialog || typeof window.DuploDialog.open !== 'function') {
    logToMain('error', 'DuploDialog assente per confirm: ' + title);
    return Promise.resolve(false);
  }
  return window.DuploDialog.open({
    kind: 'confirm',
    title: title,
    message: messageHtml,
    html: true,
    confirmLabel: confirmLabel || t('modal.confirmDelete')
  }).then(function (res) {
    return !!(res && res.ok);
  });
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
  btnResetFilters: document.getElementById('btnResetFilters'),
  btnResetSearch: document.getElementById('btnResetSearch'),
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
  statTotalSize: document.getElementById('statTotalSize'),
  resultsToolbar: document.getElementById('resultsToolbar'),
  resultsScrollContainer: document.getElementById('resultsScrollContainer'),
  resultsList: document.getElementById('resultsList'),
  emptyPlaceholder: document.getElementById('emptyPlaceholder'),
  emptyPlaceholderTitle: document.getElementById('emptyPlaceholderTitle'),
  emptyPlaceholderText: document.getElementById('emptyPlaceholderText'),
  btnBatchClean: document.getElementById('btnBatchClean'),
  btnDeleteSelected: document.getElementById('btnDeleteSelected'),
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
    if (dom.btnResetFilters) {
      dom.btnResetFilters.addEventListener('click', resetFilters);
    }
    if (dom.btnResetSearch) {
      dom.btnResetSearch.addEventListener('click', resetSearch);
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
    if (dom.btnBatchClean) {
      dom.btnBatchClean.addEventListener('click', onBatchCleanClick);
    }
    if (dom.btnDeleteSelected) {
      dom.btnDeleteSelected.addEventListener('click', onDeleteSelectedClick);
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
      uiAlert(t('alert.folderExists'), 'warning');
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

