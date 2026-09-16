/**
 * @file renderer.js
 * @description Logica del Renderer Process di DUPLO.
 * Gestisce l'interazione con l'utente (GUI moderna ed user-friendly), l'ascolto degli eventi IPC,
 * l'aggiornamento in tempo reale della progress bar e delle statistiche, e la manipolazione dei risultati.
 * 
 * Ogni interazione viene puntualmente tracciata inviando log persistenti al Main Process.
 */

const state = {
  selectedFolders: [],
  isScanning: false,
  duplicateGroups: [],
  totalFilesScanned: 0,
  pendingModalAction: null
};

function logToMain(level, message) {
  try {
    if (window.duploAPI && typeof window.duploAPI.logRendererEvent === 'function') {
      window.duploAPI.logRendererEvent(level, message);
    }
  } catch (err) {
    console.error('Errore invio log al main:', err);
  }
}

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

document.addEventListener('DOMContentLoaded', function() {
  logToMain('info', 'Interfaccia Renderer inizializzata con successo.');
  if (dom.btnAddFolder) dom.btnAddFolder.addEventListener('click', onAddFolderClick);
  if (dom.btnClearFolders) dom.btnClearFolders.addEventListener('click', onClearFoldersClick);
  bindCriteriaLogging();
  initSplitter();
  initFolderDropZone();
  bindLanguageAndCategory();
  bindAdvancedSearchLogging();
  if (dom.btnResetApp) dom.btnResetApp.addEventListener('click', resetApp);
  if (dom.btnStartScan) dom.btnStartScan.addEventListener('click', onStartScanClick);
  if (dom.btnCancelScan) dom.btnCancelScan.addEventListener('click', onCancelScanClick);
  if (dom.btnShowLogPath) dom.btnShowLogPath.addEventListener('click', onShowLogPathClick);
  if (dom.btnShowGuide) dom.btnShowGuide.addEventListener('click', onShowGuideClick);
  if (dom.btnCloseGuide) dom.btnCloseGuide.addEventListener('click', closeGuide);
  if (dom.btnOpenReadmeFile) dom.btnOpenReadmeFile.addEventListener('click', onOpenReadmeFileClick);
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && dom.guideOverlay && !dom.guideOverlay.hidden) closeGuide();
  });
  if (dom.btnExportJSON) dom.btnExportJSON.addEventListener('click', function() { onExportReport('json'); });
  if (dom.btnExportCSV) dom.btnExportCSV.addEventListener('click', function() { onExportReport('csv'); });
  if (dom.btnBatchClean) dom.btnBatchClean.addEventListener('click', onBatchCleanClick);
  if (dom.btnModalCancel) dom.btnModalCancel.addEventListener('click', closeModal);
  if (dom.btnModalConfirm) dom.btnModalConfirm.addEventListener('click', confirmModalAction);
  if (window.duploAPI && typeof window.duploAPI.onScanProgress === 'function') {
    window.duploAPI.onScanProgress(handleScanProgress);
  }
  if (window.duploAPI && typeof window.duploAPI.onOpenGuideFromMenu === 'function') {
    window.duploAPI.onOpenGuideFromMenu(function() {
      logToMain('info', 'Guida aperta dalla barra dei menu nativa');
      onShowGuideClick();
    });
  }
});

async function onAddFolderClick() {
  logToMain('info', 'Utente ha cliccato Aggiungi Cartella');
  try {
    var selected = await window.duploAPI.selectDirectory();
    if (!selected) return;
    if (state.selectedFolders.indexOf(selected) !== -1) {
      alert('Questa cartella e gia presente nell elenco.');
      return;
    }
    addFolderPath(selected, 'dialogo nativo');
  } catch (err) {
    logToMain('error', 'Errore durante la selezione della cartella: ' + err.message);
  }
}

function onClearFoldersClick() {
  if (state.selectedFolders.length === 0) return;
  state.selectedFolders = [];
  renderFolderList();
}

function removeFolder(index) {
  if (index >= 0 && index < state.selectedFolders.length) {
    state.selectedFolders.splice(index, 1);
    renderFolderList();
  }
}

function addFolderPath(folderPath, source) {
  if (!folderPath) return;
  if (state.selectedFolders.indexOf(folderPath) !== -1) return;
  state.selectedFolders.push(folderPath);
  logToMain('info', 'Cartella aggiunta tramite ' + source + ': ' + folderPath);
  renderFolderList();
}

function renderFolderList() {
  if (dom.folderCountBadge) dom.folderCountBadge.textContent = '(' + state.selectedFolders.length + ')';
  if (!dom.folderListContainer) return;
  dom.folderListContainer.innerHTML = '';
  if (state.selectedFolders.length === 0) {
    dom.folderListContainer.innerHTML = '<div class="empty-folders-hint">Nessuna cartella selezionata<br><span class="drop-hint">Trascina le cartelle ovunque nella finestra, o usa Aggiungi Cartella</span></div>';
    return;
  }
  state.selectedFolders.forEach(function(folder, idx) {
    var item = document.createElement('div');
    item.className = 'folder-item';
    var pathSpan = document.createElement('span');
    pathSpan.className = 'folder-path';
    pathSpan.title = folder;
    pathSpan.textContent = folder;
    var removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-folder';
    removeBtn.title = 'Rimuovi';
    removeBtn.textContent = 'x';
    removeBtn.onclick = function() { removeFolder(idx); };
    item.appendChild(pathSpan);
    item.appendChild(removeBtn);
    dom.folderListContainer.appendChild(item);
  });
}

function bindCriteriaLogging() {
  var checkboxes = [
    ['chkMatchSize', 'Stessa Dimensione'],
    ['chkMatchHash', 'Hash Contenuto'],
    ['chkMatchName', 'Stesso Nome'],
    ['chkMatchFuzzyName', 'Nomi Simili (Fuzzy)'],
    ['chkMatchExtension', 'Stessa Estensione'],
    ['chkMatchDate', 'Stessa Data'],
    ['chkIncludeHidden', 'Includi nascosti']
  ];
  checkboxes.forEach(function(pair) {
    var el = dom[pair[0]];
    if (!el) return;
    el.addEventListener('change', function() {
      logToMain('info', 'Filtro ' + pair[1] + ' ' + (el.checked ? 'attivato' : 'disattivato'));
    });
  });
  if (dom.selectHashAlgo) {
    dom.selectHashAlgo.addEventListener('change', function() {
      logToMain('info', 'Algoritmo hash impostato a ' + dom.selectHashAlgo.value);
    });
  }
  if (dom.inputMinSize) {
    dom.inputMinSize.addEventListener('change', function() {
      logToMain('info', 'Dimensione minima impostata a ' + dom.inputMinSize.value + ' KB');
    });
  }
}

function bindLanguageAndCategory() {
  if (dom.selectLanguage) {
    dom.selectLanguage.addEventListener('change', function() {
      var lang = dom.selectLanguage.value;
      logToMain('info', 'Lingua UI richiesta: ' + lang);
      try { window.duploAPI.setLanguage(lang); } catch (err) {
        logToMain('error', 'Cambio lingua fallito: ' + err.message);
      }
    });
  }
  if (dom.selectFileCategory) {
    updateCategoryHint();
    dom.selectFileCategory.addEventListener('change', function() {
      updateCategoryHint();
    });
  }
}

function getSelectedCategoryExtensions() {
  var api = window.DuploFileCategories;
  var id = (dom.selectFileCategory && dom.selectFileCategory.value) || 'all';
  if (api && typeof api.getCategoryExtensions === 'function') return api.getCategoryExtensions(id);
  return [];
}

function updateCategoryHint() {
  if (!dom.categoryHint) return;
  var api = window.DuploFileCategories;
  var id = (dom.selectFileCategory && dom.selectFileCategory.value) || 'all';
  if (api && typeof api.formatCategoryHint === 'function') {
    dom.categoryHint.textContent = api.formatCategoryHint(id);
  }
}

function initSplitter() {
  var splitter = dom.panelSplitter;
  var sidebar = dom.sidebarPanel;
  var bodyEl = dom.appBody;
  if (!splitter || !sidebar || !bodyEl) return;
  var math = window.DuploSplitterMath;
  var dragging = false;
  var startX = 0;
  var startWidth = 0;
  splitter.addEventListener('mousedown', function(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    splitter.classList.add('is-dragging');
    document.body.classList.add('is-resizing');
  });
  document.addEventListener('mousemove', function(event) {
    if (!dragging) return;
    var deltaX = event.clientX - startX;
    var containerWidth = bodyEl.getBoundingClientRect().width;
    var next = math ? math.clampSidebarWidth(startWidth, deltaX, containerWidth) : startWidth + deltaX;
    sidebar.style.flexBasis = next + 'px';
    sidebar.style.width = next + 'px';
  });
  document.addEventListener('mouseup', function() {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing');
  });
}

function initFolderDropZone() {
  var overlay = dom.dragOverlay;
  var dragCounter = 0;
  var dragActive = false;
  var opts = { capture: true };

  function isFileDrag(event) {
    try {
      var types = event && event.dataTransfer && event.dataTransfer.types;
      if (!types || types.length === 0) return true;
      if (typeof types.contains === 'function' && types.contains('Files')) return true;
      var arr = Array.from(types);
      return arr.indexOf('Files') !== -1 || arr.indexOf('application/x-moz-file') !== -1;
    } catch (_err) {
      return true;
    }
  }

  function blockElectronNavigation(event) {
    try {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        try { event.dataTransfer.dropEffect = 'copy'; } catch (_err) { /* ignore */ }
      }
    } catch (_err) { /* ignore */ }
  }

  function showOverlay() {
    try {
      if (!dragActive) {
        dragActive = true;
        logToMain('info', 'Iniziato drag & drop');
        try { console.info('[DUPLO drop] overlay attivo'); } catch (_err) { /* ignore */ }
      }
      if (overlay) {
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
      }
    } catch (err) {
      logToMain('error', 'showOverlay drop: ' + (err && err.message));
    }
  }

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

  function onDragEnter(event) {
    try {
      blockElectronNavigation(event);
      if (!isFileDrag(event)) return;
      dragCounter += 1;
      showOverlay();
    } catch (err) {
      logToMain('error', 'dragenter fallito: ' + (err && err.message));
    }
  }

  function onDragOver(event) {
    try {
      blockElectronNavigation(event);
      if (isFileDrag(event) && !dragActive) showOverlay();
    } catch (err) {
      logToMain('error', 'dragover fallito: ' + (err && err.message));
    }
  }

  function onDragLeave(event) {
    try {
      blockElectronNavigation(event);
      dragCounter -= 1;
      if (dragCounter <= 0) hideOverlay();
    } catch (err) {
      logToMain('error', 'dragleave fallito: ' + (err && err.message));
      hideOverlay();
    }
  }

  async function onDrop(event) {
    try {
      blockElectronNavigation(event);
      dragCounter = 0;
      hideOverlay();
      await handleFolderDrop(event);
    } catch (err) {
      hideOverlay();
      logToMain('error', 'drop fallito: ' + (err && err.message));
    }
  }

  function armPreventDefault(target, label) {
    if (!target || typeof target.addEventListener !== 'function') return;
    try {
      target.addEventListener('dragenter', blockElectronNavigation, opts);
      target.addEventListener('dragover', blockElectronNavigation, opts);
      target.addEventListener('drop', blockElectronNavigation, opts);
      logToMain('debug', 'preventDefault drop armato su ' + label);
    } catch (err) {
      logToMain('error', 'armPreventDefault ' + label + ': ' + (err && err.message));
    }
  }

  try {
    window.addEventListener('dragenter', onDragEnter, opts);
    window.addEventListener('dragover', onDragOver, opts);
    window.addEventListener('dragleave', onDragLeave, opts);
    window.addEventListener('drop', onDrop, opts);
    window.addEventListener('dragend', function() { hideOverlay(); }, opts);
    armPreventDefault(document, 'document');
    armPreventDefault(overlay, '#drag-overlay');
    logToMain('debug', 'Listener drag & drop globali installati su window, document e overlay.');
  } catch (err) {
    logToMain('error', 'Impossibile installare il drag & drop: ' + (err && err.message));
  }
}

function resolveDroppedFilePath(file) {
  try {
    var api = (window.duploAPI && window.duploAPI.getPathForFile)
      ? window.duploAPI
      : (window.api && window.api.getPathForFile ? window.api : null);
    if (api && typeof api.getPathForFile === 'function') {
      var fromNative = api.getPathForFile(file);
      if (typeof fromNative === 'string' && fromNative.length > 0) return fromNative;
    }
  } catch (err) {
    logToMain('warn', 'getPathForFile fallito: ' + (err && err.message));
  }
  try {
    if (file && typeof file.path === 'string' && file.path.length > 0) return file.path;
  } catch (_err) { /* ignore */ }
  return '';
}

async function handleFolderDrop(event) {
  try {
    logToMain('info', 'Iniziato drag & drop (drop ricevuto)');
    var files = event.dataTransfer && event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    try { console.info('[DUPLO drop] elementi rilasciati:', files.length); } catch (_err) { /* ignore */ }
    logToMain('info', 'Drop: ' + files.length + ' elementi nel DataTransfer');
    if (files.length === 0) {
      logToMain('warn', 'Drop ignorato: DataTransfer.files vuoto');
      return;
    }

    var added = 0;
    var validatedDirs = 0;
    var i;
    for (i = 0; i < files.length; i += 1) {
      var file = files[i];
      var droppedPath = resolveDroppedFilePath(file);
      var label = (file && file.name) ? file.name : ('indice ' + i);
      logToMain('debug', 'Drop item «' + label + '» path=' + (droppedPath || '(vuoto)'));
      try { console.info('[DUPLO drop] item', label, droppedPath || '(vuoto)'); } catch (_err) { /* ignore */ }
      if (!droppedPath) {
        logToMain('warn', 'Drop ignorato: percorso Electron assente per «' + label + '» (webUtils.getPathForFile)');
        continue;
      }
      var result = null;
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
        var before = state.selectedFolders.length;
        addFolderPath(result.directory, 'drag & drop');
        if (state.selectedFolders.length > before) added += 1;
      } else {
        var skipped = result && result.skipped ? result.skipped : { path: droppedPath, reason: 'non è una cartella' };
        logToMain('warn', 'Drop ignorato: non è una cartella (' + skipped.path + ' — ' + skipped.reason + ')');
      }
    }

    logToMain('info', 'Aggiunte ' + added + ' cartelle via drop (validate-and-add-folder, ' + validatedDirs + ' directory valide)');
    try { console.info('[DUPLO drop] aggiunte', added, 'cartelle'); } catch (_err) { /* ignore */ }
    if (validatedDirs === 0) {
      alert('Nessuna cartella valida nel trascinamento. Trascina cartelle, non singoli file.');
    }
  } catch (err) {
    logToMain('error', 'Errore drag & drop: ' + err.message);
    try { console.error('[DUPLO drop]', err); } catch (_err) { /* ignore */ }
  }
}

function collectScanCriteria() {
  var filters = window.DuploAdvancedFilters;
  var categoryExts = getSelectedCategoryExtensions();
  var customExts = filters && typeof filters.parseExtensionList === 'function'
    ? filters.parseExtensionList(dom.inputCustomExtensions ? dom.inputCustomExtensions.value : '')
    : [];
  var resolved = filters && typeof filters.resolveIncludeExtensions === 'function'
    ? filters.resolveIncludeExtensions(customExts, categoryExts)
    : { includeExtensions: customExts.length ? customExts : categoryExts, usedCustom: customExts.length > 0 };
  var unit = (dom.selectSizeUnit && dom.selectSizeUnit.value) || 'kb';
  var simpleMinKb = parseInt(dom.inputMinSize && dom.inputMinSize.value, 10) || 0;
  var minSizeBytes = simpleMinKb * 1024;
  var maxSizeBytes = 0;
  if (filters && typeof filters.sizeToBytes === 'function') {
    var advMin = filters.sizeToBytes(dom.inputAdvMinSize && dom.inputAdvMinSize.value, unit);
    var advMax = filters.sizeToBytes(dom.inputAdvMaxSize && dom.inputAdvMaxSize.value, unit);
    if (advMin > 0) minSizeBytes = Math.max(minSizeBytes, advMin);
    maxSizeBytes = advMax;
  }
  var afterMs = filters && typeof filters.dateInputToMs === 'function'
    ? filters.dateInputToMs(dom.inputModifiedFrom && dom.inputModifiedFrom.value, false) : 0;
  var beforeMs = filters && typeof filters.dateInputToMs === 'function'
    ? filters.dateInputToMs(dom.inputModifiedTo && dom.inputModifiedTo.value, true) : 0;
  var range = filters && typeof filters.normalizeDateRange === 'function'
    ? filters.normalizeDateRange(afterMs, beforeMs)
    : { modifiedAfterMs: afterMs, modifiedBeforeMs: beforeMs, swapped: false };
  var criteria = {
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
  var anyCriterion = criteria.matchSize || criteria.matchHash || criteria.matchName
    || criteria.matchFuzzyName || criteria.matchExtension || criteria.matchDate;
  if (!anyCriterion) return null;
  return criteria;
}

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
    if (dom.chkMatchSize) dom.chkMatchSize.checked = true;
    if (dom.chkMatchHash) dom.chkMatchHash.checked = true;
    if (dom.chkMatchName) dom.chkMatchName.checked = false;
    if (dom.chkMatchFuzzyName) dom.chkMatchFuzzyName.checked = false;
    if (dom.chkMatchExtension) dom.chkMatchExtension.checked = false;
    if (dom.chkMatchDate) dom.chkMatchDate.checked = false;
    if (dom.chkIncludeHidden) dom.chkIncludeHidden.checked = false;
    if (dom.inputMinSize) dom.inputMinSize.value = '0';
    if (dom.selectHashAlgo) dom.selectHashAlgo.value = 'sha256';
    if (dom.selectFileCategory) dom.selectFileCategory.value = 'all';
    updateCategoryHint();
    if (dom.inputCustomExtensions) dom.inputCustomExtensions.value = '';
    if (dom.inputModifiedFrom) dom.inputModifiedFrom.value = '';
    if (dom.inputModifiedTo) dom.inputModifiedTo.value = '';
    if (dom.inputAdvMinSize) dom.inputAdvMinSize.value = '';
    if (dom.inputAdvMaxSize) dom.inputAdvMaxSize.value = '';
    if (dom.selectSizeUnit) dom.selectSizeUnit.value = 'kb';
    if (dom.advancedSearchPanel) dom.advancedSearchPanel.open = false;
    if (dom.resultsList) dom.resultsList.innerHTML = '';
    if (dom.statsBanner) dom.statsBanner.style.display = 'none';
    if (dom.resultsToolbar) dom.resultsToolbar.style.display = 'none';
    if (dom.progressBarSection) dom.progressBarSection.style.display = 'none';
    if (dom.emptyPlaceholder) dom.emptyPlaceholder.style.display = 'flex';
    if (dom.emptyPlaceholderTitle) dom.emptyPlaceholderTitle.textContent = 'Nessuna scansione eseguita';
    logToMain('info', 'Applicazione resettata dall utente');
  } catch (err) {
    logToMain('error', 'Reset applicazione fallito: ' + err.message);
  }
}

function bindAdvancedSearchLogging() {
  try {
    if (dom.advancedSearchPanel) {
      dom.advancedSearchPanel.addEventListener('toggle', function() {
        logToMain('info', 'Ricerca Avanzata ' + (dom.advancedSearchPanel.open ? 'aperta' : 'chiusa'));
      });
    }
  } catch (err) {
    logToMain('error', 'bindAdvancedSearchLogging: ' + err.message);
  }
}

async function onStartScanClick() {
  logToMain('info', 'Utente ha cliccato Avvia Scansione');
  if (state.selectedFolders.length === 0) {
    alert('Seleziona almeno una cartella da scansionare prima di procedere.');
    return;
  }
  var criteria = collectScanCriteria();
  if (!criteria) {
    alert('Attiva almeno un parametro di confronto (consigliati: Stessa Dimensione + Hash Contenuto).');
    return;
  }
  handleScanProgress.lastPhase = null;
  state.isScanning = true;
  state.duplicateGroups = [];
  state.totalFilesScanned = 0;
  if (dom.btnStartScan) dom.btnStartScan.disabled = true;
  if (dom.btnCancelScan) dom.btnCancelScan.style.display = 'inline-flex';
  if (dom.progressBarSection) dom.progressBarSection.style.display = 'flex';
  if (dom.progressTrack) dom.progressTrack.className = 'progress-track indeterminate';
  if (dom.progressFillBar) dom.progressFillBar.style.width = '0%';
  if (dom.emptyPlaceholder) dom.emptyPlaceholder.style.display = 'none';
  try {
    var results = await window.duploAPI.startScan({ directories: state.selectedFolders, criteria: criteria });
    state.duplicateGroups = results || [];
    renderResults();
  } catch (err) {
    logToMain('error', 'Errore durante la scansione: ' + err.message);
    alert('Errore durante la scansione: ' + err.message);
  } finally {
    state.isScanning = false;
    if (dom.btnStartScan) dom.btnStartScan.disabled = false;
    if (dom.btnCancelScan) dom.btnCancelScan.style.display = 'none';
    if (dom.progressBarSection) dom.progressBarSection.style.display = 'none';
  }
}

async function onCancelScanClick() {
  try { await window.duploAPI.cancelScan(); } catch (err) {
    logToMain('error', 'Errore interruzione scansione: ' + err.message);
  }
}

function handleScanProgress(data) {
  if (data.filesCount) state.totalFilesScanned = data.filesCount;
  if (data.phase && data.phase !== handleScanProgress.lastPhase) {
    handleScanProgress.lastPhase = data.phase;
  }
  if (data.phase === 'collecting') {
    if (dom.progressTrack) dom.progressTrack.className = 'progress-track indeterminate';
    if (dom.progressPhaseText && dom.progressPhaseText.querySelector('span')) {
      dom.progressPhaseText.querySelector('span').textContent = 'Raccolta e indicizzazione file...';
    }
    if (dom.progressStatusDetail) {
      dom.progressStatusDetail.textContent = (data.filesCount || 0) + ' file trovati: ' + (data.currentFile || '');
    }
  } else if (data.phase === 'grouping') {
    if (dom.progressTrack) dom.progressTrack.className = 'progress-track indeterminate';
    if (dom.progressPhaseText && dom.progressPhaseText.querySelector('span')) {
      dom.progressPhaseText.querySelector('span').textContent = 'Filtro e raggruppamento preliminare...';
    }
  } else if (data.phase === 'hashing') {
    if (dom.progressTrack) dom.progressTrack.className = 'progress-track';
    var total = data.totalToHash || 1;
    var current = data.hashedCount || 0;
    var percent = Math.min(100, Math.round((current / total) * 100));
    if (dom.progressFillBar) dom.progressFillBar.style.width = percent + '%';
    if (dom.progressPercentText) dom.progressPercentText.textContent = percent + '%';
    if (dom.progressStatusDetail) dom.progressStatusDetail.textContent = data.currentFile || '';
  }
}

function renderResults() {
  if (dom.resultsList) dom.resultsList.innerHTML = '';
  if (state.duplicateGroups.length === 0) {
    if (dom.statsBanner) dom.statsBanner.style.display = 'none';
    if (dom.resultsToolbar) dom.resultsToolbar.style.display = 'none';
    if (dom.emptyPlaceholder) dom.emptyPlaceholder.style.display = 'flex';
    if (dom.emptyPlaceholderTitle) dom.emptyPlaceholderTitle.textContent = 'Nessun duplicato trovato';
    return;
  }
  var totalDuplicates = 0;
  var totalWastedBytes = 0;
  state.duplicateGroups.forEach(function(g) {
    totalDuplicates += (g.fileCount - 1);
    totalWastedBytes += g.wastedBytes;
  });
  if (dom.statFilesScanned) dom.statFilesScanned.textContent = state.totalFilesScanned || '-';
  if (dom.statGroupsCount) dom.statGroupsCount.textContent = state.duplicateGroups.length;
  if (dom.statDuplicatesCount) dom.statDuplicatesCount.textContent = totalDuplicates;
  if (dom.statWastedSpace) dom.statWastedSpace.textContent = formatBytes(totalWastedBytes);
  if (dom.statsBanner) dom.statsBanner.style.display = 'grid';
  if (dom.resultsToolbar) dom.resultsToolbar.style.display = 'flex';
  if (dom.emptyPlaceholder) dom.emptyPlaceholder.style.display = 'none';
  state.duplicateGroups.forEach(function(group, groupIdx) {
    var card = document.createElement('div');
    card.className = 'duplicate-group-card';
    var header = document.createElement('div');
    header.className = 'group-header';
    header.innerHTML = '<div class="group-info"><span class="group-badge">Gruppo #' + (groupIdx + 1) + '</span><span>' + formatBytes(group.size) + ' ciascuno</span></div><div class="group-wasted">Spreco: ' + formatBytes(group.wastedBytes) + '</div>';
    var list = document.createElement('div');
    list.className = 'group-files-list';
    group.files.forEach(function(file, fIdx) {
      var isOriginal = (fIdx === 0);
      var row = document.createElement('div');
      row.className = 'file-row' + (isOriginal ? ' is-original' : '');
      var dateStr = new Date(file.mtimeMs).toLocaleString();
      row.innerHTML = '<div class="file-main-info"><span class="file-tag ' + (isOriginal ? 'tag-original' : 'tag-duplicate') + '">' + (isOriginal ? 'Originale' : 'Duplicato') + '</span><span class="file-path-text">' + escapeHtml(file.path) + '</span></div><div class="file-meta"><span>' + dateStr + '</span></div>';
      var pathEl = row.querySelector('.file-path-text');
      if (pathEl) {
        pathEl.addEventListener('click', function() {
          window.duploAPI.showItemInFolder(file.path);
        });
      }
      if (!isOriginal) {
        var del = document.createElement('button');
        del.className = 'btn-icon delete-hover';
        del.textContent = 'Elimina';
        del.addEventListener('click', function() { askDeleteSingleFile(group, fIdx); });
        row.querySelector('.file-meta').appendChild(del);
      }
      list.appendChild(row);
    });
    card.appendChild(header);
    card.appendChild(list);
    (dom.resultsList || dom.resultsScrollContainer).appendChild(card);
  });
}

function askDeleteSingleFile(group, fileIndex) {
  var file = group.files[fileIndex];
  openModal('Elimina File Duplicato', 'Sei sicuro di voler eliminare definitivamente:<br><code>' + escapeHtml(file.path) + '</code>', async function() {
    var res = await window.duploAPI.deleteFile(file.path);
    if (res.success) {
      group.files.splice(fileIndex, 1);
      group.fileCount--;
      group.wastedBytes = (group.fileCount - 1) * group.size;
      if (group.files.length <= 1) {
        state.duplicateGroups = state.duplicateGroups.filter(function(g) { return g.groupId !== group.groupId; });
      }
      renderResults();
    } else {
      alert('Impossibile eliminare il file: ' + res.error);
    }
  });
}

function onBatchCleanClick() {
  if (state.duplicateGroups.length === 0) return;
  var totalFilesToDelete = 0;
  var totalBytesToFree = 0;
  state.duplicateGroups.forEach(function(g) {
    totalFilesToDelete += (g.fileCount - 1);
    totalBytesToFree += g.wastedBytes;
  });
  openModal('Pulizia Rapida Duplicati', 'Eliminera ' + totalFilesToDelete + ' file duplicati. Spazio: ' + formatBytes(totalBytesToFree), async function() {
    var deletedCount = 0;
    var errorCount = 0;
    var groupsCopy = state.duplicateGroups.slice();
    for (var gi = 0; gi < groupsCopy.length; gi++) {
      var group = groupsCopy[gi];
      for (var i = group.files.length - 1; i >= 1; i--) {
        var file = group.files[i];
        var res = await window.duploAPI.deleteFile(file.path);
        if (res.success) { deletedCount++; group.files.splice(i, 1); }
        else errorCount++;
      }
    }
    state.duplicateGroups = state.duplicateGroups.filter(function(g) { return g.files.length > 1; });
    renderResults();
    alert('Pulizia completata! ' + deletedCount + ' file eliminati.' + (errorCount ? ' Errori: ' + errorCount : ''));
  });
}

async function onExportReport(format) {
  if (state.duplicateGroups.length === 0) {
    alert('Nessun risultato da esportare.');
    return;
  }
  try {
    var res = await window.duploAPI.exportReport(format, state.duplicateGroups);
    if (res.success) alert('Report esportato in:\n' + res.path);
    else if (!res.canceled) alert('Errore esportazione report: ' + res.error);
  } catch (err) {
    logToMain('error', 'Errore esportazione: ' + err.message);
  }
}

async function onShowLogPathClick() {
  try {
    var logPath = await window.duploAPI.getLogPath();
    openModal('File di Log di DUPLO', 'File di log:<br><code>' + escapeHtml(logPath) + '</code>', null);
  } catch (err) {
    console.error('Errore percorso log:', err);
  }
}

async function onShowGuideClick() {
  if (!dom.guideOverlay) return;
  dom.guideOverlay.hidden = false;
  if (dom.guideContent && dom.guideContent.dataset.loaded === '1') return;
  if (dom.guideContent) dom.guideContent.innerHTML = '<p class="guide-loading">Caricamento del manuale…</p>';
  try {
    var res = await window.duploAPI.getReadme();
    if (!res.success) throw new Error(res.error || 'README non disponibile');
    var toHtml = (window.DuploMarkdown && window.DuploMarkdown.markdownToHtml)
      ? window.DuploMarkdown.markdownToHtml
      : function(text) { return '<pre>' + escapeHtml(text) + '</pre>'; };
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

function closeGuide() {
  if (dom.guideOverlay) dom.guideOverlay.hidden = true;
}

async function onOpenReadmeFileClick() {
  try {
    var res = await window.duploAPI.openReadme();
    if (!res.success) alert('Impossibile aprire README.md:\n' + (res.error || 'file non trovato'));
  } catch (err) {
    alert('Impossibile aprire README.md:\n' + err.message);
  }
}

function openModal(title, messageHtml, confirmAction) {
  if (dom.modalTitle) dom.modalTitle.textContent = title;
  if (dom.modalMessage) dom.modalMessage.innerHTML = messageHtml;
  state.pendingModalAction = confirmAction;
  if (!confirmAction) {
    if (dom.btnModalConfirm) dom.btnModalConfirm.style.display = 'none';
    if (dom.btnModalCancel) dom.btnModalCancel.textContent = 'Chiudi';
  } else {
    if (dom.btnModalConfirm) dom.btnModalConfirm.style.display = 'inline-flex';
    if (dom.btnModalCancel) dom.btnModalCancel.textContent = 'Annulla';
  }
  if (dom.confirmModal) dom.confirmModal.style.display = 'flex';
}

function closeModal() {
  if (dom.confirmModal) dom.confirmModal.style.display = 'none';
  state.pendingModalAction = null;
}

function confirmModalAction() {
  if (typeof state.pendingModalAction === 'function') {
    var action = state.pendingModalAction;
    closeModal();
    action();
  } else closeModal();
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
