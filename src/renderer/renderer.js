/**
 * @file renderer.js
 * @description Logica del Renderer Process di DupFinder.
 * Gestisce l'interazione con l'utente (GUI moderna ed user-friendly), l'ascolto degli eventi IPC,
 * l'aggiornamento in tempo reale della progress bar e delle statistiche, e la manipolazione dei risultati.
 * 
 * Ogni interazione viene puntualmente tracciata inviando log persistenti al Main Process.
 */

// Stato applicativo dell'interfaccia
const state = {
  selectedFolders: [],
  isScanning: false,
  duplicateGroups: [],
  totalFilesScanned: 0,
  pendingModalAction: null
};

// =========================================================================
// HELPER DI LOGGING VERSO IL MAIN PROCESS
// =========================================================================

/**
 * Invia un evento di log al Main Process affinché venga scritto nel file di log su disco.
 * @param {'info'|'warn'|'error'|'debug'} level 
 * @param {string} message 
 */
function logToMain(level, message) {
  try {
    if (window.dupFinderAPI && typeof window.dupFinderAPI.logRendererEvent === 'function') {
      window.dupFinderAPI.logRendererEvent(level, message);
    }
  } catch (err) {
    console.error('Errore invio log al main:', err);
  }
}

// =========================================================================
// RIFERIMENTI AGLI ELEMENTI DEL DOM
// =========================================================================
const dom = {
  // Cartelle
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

  // Criteri
  chkMatchSize: document.getElementById('chkMatchSize'),
  chkMatchHash: document.getElementById('chkMatchHash'),
  chkMatchName: document.getElementById('chkMatchName'),
  chkMatchExtension: document.getElementById('chkMatchExtension'),
  chkMatchDate: document.getElementById('chkMatchDate'),
  inputMinSize: document.getElementById('inputMinSize'),
  selectHashAlgo: document.getElementById('selectHashAlgo'),
  chkIncludeHidden: document.getElementById('chkIncludeHidden'),

  // Azioni di Scansione
  btnStartScan: document.getElementById('btnStartScan'),
  btnCancelScan: document.getElementById('btnCancelScan'),
  btnShowLogPath: document.getElementById('btnShowLogPath'),
  btnShowGuide: document.getElementById('btnShowGuide'),
  guideOverlay: document.getElementById('guideOverlay'),
  guideContent: document.getElementById('guideContent'),
  btnCloseGuide: document.getElementById('btnCloseGuide'),
  btnOpenReadmeFile: document.getElementById('btnOpenReadmeFile'),

  // Barra di Avanzamento
  progressBarSection: document.getElementById('progressBarSection'),
  progressTrack: document.getElementById('progressTrack'),
  progressFillBar: document.getElementById('progressFillBar'),
  progressPhaseText: document.getElementById('progressPhaseText'),
  progressPercentText: document.getElementById('progressPercentText'),
  progressStatusDetail: document.getElementById('progressStatusDetail'),

  // Statistiche e Risultati
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

  // Modale
  confirmModal: document.getElementById('confirmModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalMessage: document.getElementById('modalMessage'),
  btnModalCancel: document.getElementById('btnModalCancel'),
  btnModalConfirm: document.getElementById('btnModalConfirm')
};

// =========================================================================
// INIZIALIZZAZIONE EVENTI
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  logToMain('info', 'Interfaccia Renderer inizializzata con successo.');

  // Cartelle: dialogo nativo Electron (non un <input type="file"> HTML).
  dom.btnAddFolder.addEventListener('click', onAddFolderClick);
  dom.btnClearFolders.addEventListener('click', onClearFoldersClick);

  // Ogni variazione dei filtri viene scritta nel log persistente (debug infallibile).
  bindCriteriaLogging();
  initSplitter();
  initFolderDropZone();
  bindLanguageAndCategory();

  // Listener per avvio e stop scansione
  dom.btnStartScan.addEventListener('click', onStartScanClick);
  dom.btnCancelScan.addEventListener('click', onCancelScanClick);

  // Listener visualizzazione log path e guida README
  dom.btnShowLogPath.addEventListener('click', onShowLogPathClick);
  dom.btnShowGuide.addEventListener('click', onShowGuideClick);
  dom.btnCloseGuide.addEventListener('click', closeGuide);
  dom.btnOpenReadmeFile.addEventListener('click', onOpenReadmeFileClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dom.guideOverlay.hidden) {
      closeGuide();
    }
  });

  // Listener esportazione report
  dom.btnExportJSON.addEventListener('click', () => onExportReport('json'));
  dom.btnExportCSV.addEventListener('click', () => onExportReport('csv'));
  dom.btnBatchClean.addEventListener('click', onBatchCleanClick);

  // Listener Modale
  dom.btnModalCancel.addEventListener('click', closeModal);
  dom.btnModalConfirm.addEventListener('click', confirmModalAction);

  // Registra la sottoscrizione al progresso della scansione
  if (window.dupFinderAPI && typeof window.dupFinderAPI.onScanProgress === 'function') {
    window.dupFinderAPI.onScanProgress(handleScanProgress);
  }

  // Voce nativa "Guida" / tasto F1: apre lo stesso pannello README del pulsante Guida.
  if (window.dupFinderAPI && typeof window.dupFinderAPI.onOpenGuideFromMenu === 'function') {
    window.dupFinderAPI.onOpenGuideFromMenu(() => {
      logToMain('info', 'Guida aperta dalla barra dei menu nativa');
      onShowGuideClick();
    });
  }
});

// =========================================================================
// GESTIONE CARTELLE DI ORIGINE
// =========================================================================

/**
 * Apre il dialogo nativo per selezionare una cartella da scansionare.
 */
async function onAddFolderClick() {
  logToMain('info', 'Utente ha cliccato "Aggiungi Cartella"');
  try {
    const selected = await window.dupFinderAPI.selectDirectory();
    if (!selected) {
      logToMain('info', 'Selezione cartella annullata o nessun percorso fornito.');
      return;
    }

    if (state.selectedFolders.includes(selected)) {
      logToMain('warn', `La cartella "${selected}" è già presente nell'elenco.`);
      alert('Questa cartella è già presente nell\'elenco.');
      return;
    }

    addFolderPath(selected, 'dialogo nativo');
  } catch (err) {
    logToMain('error', `Errore durante la selezione della cartella: ${err.message}`);
  }
}

/**
 * Svuota tutte le cartelle selezionate.
 */
function onClearFoldersClick() {
  if (state.selectedFolders.length === 0) return;
  logToMain('info', 'Utente ha svuotato l\'elenco delle cartelle');
  state.selectedFolders = [];
  renderFolderList();
}

/**
 * Rimuove una specifica cartella dall'elenco tramite indice.
 * @param {number} index 
 */
function removeFolder(index) {
  if (index >= 0 && index < state.selectedFolders.length) {
    const removed = state.selectedFolders.splice(index, 1);
    logToMain('info', `Rimossa cartella "${removed[0]}". Rimanenti: ${state.selectedFolders.length}`);
    renderFolderList();
  }
}

/**
 * Inserisce un percorso cartella nell'elenco, evitando i duplicati.
 *
 * @param {string} folderPath
 * @param {string} source - Origine per il log (dialogo, drag & drop, …)
 */
function addFolderPath(folderPath, source) {
  if (!folderPath) return;
  if (state.selectedFolders.includes(folderPath)) {
    logToMain('warn', `Cartella già in elenco (fonte: ${source}): "${folderPath}"`);
    return;
  }
  state.selectedFolders.push(folderPath);
  logToMain('info', `Cartella "${folderPath}" aggiunta tramite ${source}. Totale: ${state.selectedFolders.length}`);
  renderFolderList();
}

/**
 * Aggiorna la vista dell'elenco cartelle nella sidebar.
 */
function renderFolderList() {
  dom.folderCountBadge.textContent = `(${state.selectedFolders.length})`;
  dom.folderListContainer.innerHTML = '';

  if (state.selectedFolders.length === 0) {
    dom.folderListContainer.innerHTML = '<div class="empty-folders-hint">Nessuna cartella selezionata<br><span class="drop-hint">Trascina qui una o più cartelle da Esplora file</span></div>';
    return;
  }

  state.selectedFolders.forEach((folder, idx) => {
    const item = document.createElement('div');
    item.className = 'folder-item';

    const pathSpan = document.createElement('span');
    pathSpan.className = 'folder-path';
    pathSpan.title = folder;
    pathSpan.textContent = folder;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-folder';
    removeBtn.title = 'Rimuovi';
    removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    removeBtn.onclick = () => removeFolder(idx);

    item.appendChild(pathSpan);
    item.appendChild(removeBtn);
    dom.folderListContainer.appendChild(item);
  });
}

/**
 * Collega i checkbox e i campi filtro al logger: ogni click/change dell'utente
 * produce una riga nel file di log (e in console in sviluppo).
 */
function bindCriteriaLogging() {
  const checkboxes = [
    ['chkMatchSize', 'Stessa Dimensione'],
    ['chkMatchHash', 'Hash Contenuto'],
    ['chkMatchName', 'Stesso Nome'],
    ['chkMatchExtension', 'Stessa Estensione'],
    ['chkMatchDate', 'Stessa Data'],
    ['chkIncludeHidden', 'Includi nascosti']
  ];
  checkboxes.forEach(([id, label]) => {
    const el = dom[id];
    if (!el) return;
    el.addEventListener('change', () => {
      logToMain('info', `Filtro "${label}" ${el.checked ? 'attivato' : 'disattivato'}`);
    });
  });
  dom.selectHashAlgo.addEventListener('change', () => {
    logToMain('info', `Algoritmo hash impostato a ${dom.selectHashAlgo.value}`);
  });
  dom.inputMinSize.addEventListener('change', () => {
    logToMain('info', `Dimensione minima impostata a ${dom.inputMinSize.value} KB`);
  });
}

/**
 * Tendina lingua (menu nativo) e tendina categorie file.
 */
function bindLanguageAndCategory() {
  if (dom.selectLanguage) {
    dom.selectLanguage.addEventListener('change', () => {
      const lang = dom.selectLanguage.value;
      logToMain('info', `Lingua UI richiesta: ${lang}`);
      try {
        window.dupFinderAPI.setLanguage(lang);
      } catch (err) {
        logToMain('error', `Cambio lingua fallito: ${err.message}`);
      }
    });
  }
  if (dom.selectFileCategory) {
    updateCategoryHint();
    dom.selectFileCategory.addEventListener('change', () => {
      const id = dom.selectFileCategory.value;
      const exts = getSelectedCategoryExtensions();
      logToMain('info', `Categoria file "${id}" → ${exts.length ? exts.join(',') : '(tutti i tipi)'}`);
      updateCategoryHint();
    });
  }
}

function getSelectedCategoryExtensions() {
  const api = window.DupFinderFileCategories;
  const id = (dom.selectFileCategory && dom.selectFileCategory.value) || 'all';
  if (api && typeof api.getCategoryExtensions === 'function') {
    return api.getCategoryExtensions(id);
  }
  return [];
}

function updateCategoryHint() {
  if (!dom.categoryHint) return;
  const api = window.DupFinderFileCategories;
  const id = (dom.selectFileCategory && dom.selectFileCategory.value) || 'all';
  if (api && typeof api.formatCategoryHint === 'function') {
    dom.categoryHint.textContent = api.formatCategoryHint(id);
  }
}

/**
 * Splitter verticale: il drag inizia sul divisore, ma mousemove/mouseup
 * sono sul document così il tracciamento non si perde se il cursore esce
 * dal hit-area da 6px (movimento rapido).
 *
 * Formula: newWidth = clamp(startWidth + (clientX - startX), 280, bodyWidth - 320)
 * applicata come flex-basis CSS sulla sidebar.
 */
function initSplitter() {
  const splitter = dom.panelSplitter;
  const sidebar = dom.sidebarPanel;
  const bodyEl = dom.appBody;
  if (!splitter || !sidebar || !bodyEl) {
    logToMain('warn', 'Splitter non inizializzato: elementi DOM mancanti');
    return;
  }

  const math = window.DupFinderSplitterMath;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  splitter.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    splitter.classList.add('is-dragging');
    document.body.classList.add('is-resizing');
    logToMain('debug', `Splitter mousedown: startWidth=${startWidth}px startX=${startX}`);
  });

  document.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    try {
      const deltaX = event.clientX - startX;
      const containerWidth = bodyEl.getBoundingClientRect().width;
      const next = math
        ? math.clampSidebarWidth(startWidth, deltaX, containerWidth)
        : startWidth + deltaX;
      sidebar.style.flexBasis = `${next}px`;
      sidebar.style.width = `${next}px`;
    } catch (err) {
      logToMain('error', `Splitter mousemove: ${err.message}`);
    }
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing');
    const finalW = Math.round(sidebar.getBoundingClientRect().width);
    logToMain('info', `Splitter mouseup: sidebar ${finalW}px`);
  });
}

/**
 * Drag & drop cartelle sull'elenco. dragover deve chiamare preventDefault
 * altrimenti il browser/Electron rifiuta il drop.
 */
function initFolderDropZone() {
  const zone = dom.folderListContainer;
  if (!zone) return;

  const onDragOver = (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    zone.classList.add('is-drop-target');
  };
  // Senza preventDefault su dragover il browser rifiuta il drop sulla zona.
  zone.addEventListener('dragenter', onDragOver);
  zone.addEventListener('dragover', onDragOver);
  zone.addEventListener('dragleave', (event) => {
    if (!zone.contains(event.relatedTarget)) {
      zone.classList.remove('is-drop-target');
    }
  });
  zone.addEventListener('drop', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    zone.classList.remove('is-drop-target');
    await handleFolderDrop(event);
  });

  document.addEventListener('dragover', (event) => {
    event.preventDefault();
  });
  document.addEventListener('drop', (event) => {
    if (!zone.contains(event.target)) {
      event.preventDefault();
    }
  });
}

/**
 * Legge i path da dataTransfer.files (Electron imposta File.path) e chiede
 * al Main Process di tenere solo le directory reali (fs.statSync).
 *
 * @param {DragEvent} event
 */
async function handleFolderDrop(event) {
  try {
    const files = event.dataTransfer && event.dataTransfer.files
      ? Array.from(event.dataTransfer.files)
      : [];
    const rawPaths = files.map((f) => f.path).filter(Boolean);
    logToMain('info', `Drop ricevuto: ${rawPaths.length} elementi`);
    if (rawPaths.length === 0) {
      logToMain('warn', 'Drop senza path (non è una cartella di filesystem)');
      return;
    }
    const result = await window.dupFinderAPI.filterDirectories(rawPaths);
    (result.skipped || []).forEach((item) => {
      logToMain('warn', `Drop ignorato "${item.path}": ${item.reason}`);
    });
    (result.directories || []).forEach((dir) => {
      addFolderPath(dir, 'drag & drop');
    });
    if (!(result.directories || []).length) {
      alert('Nessuna cartella valida nel trascinamento. Trascina cartelle, non singoli file.');
    }
  } catch (err) {
    logToMain('error', `Errore drag & drop: ${err.message}`);
  }
}

/**
 * Legge i checkbox e i campi della sidebar e costruisce l'oggetto ScanCriteria
 * atteso dal Main Process (src/scanner.js).
 *
 * @returns {object|null} criteri, oppure null se l'utente non ha scelto nessun parametro
 */
function collectScanCriteria() {
  const includeExts = getSelectedCategoryExtensions();
  const minSizeKB = parseInt(dom.inputMinSize.value, 10) || 0;

  const criteria = {
    matchSize: dom.chkMatchSize.checked,
    matchHash: dom.chkMatchHash.checked,
    matchName: dom.chkMatchName.checked,
    matchExtension: dom.chkMatchExtension.checked,
    matchDate: dom.chkMatchDate.checked,
    hashAlgorithm: dom.selectHashAlgo.value,
    minSizeBytes: minSizeKB * 1024,
    maxSizeBytes: 0,
    includeExtensions: includeExts,
    excludeExtensions: [],
    includeHidden: dom.chkIncludeHidden.checked
  };

  // Senza nessun criterio tutti i file finirebbero nello stesso bucket: è un falso positivo.
  const anyCriterion = criteria.matchSize || criteria.matchHash || criteria.matchName
    || criteria.matchExtension || criteria.matchDate;
  if (!anyCriterion) {
    return null;
  }
  return criteria;
}

// =========================================================================
// GESTIONE SCANSIONE E STATISTICHE
// =========================================================================

/**
 * Avvia la scansione raccogliendo i parametri impostati dall'utente.
 */
async function onStartScanClick() {
  logToMain('info', 'Utente ha cliccato "Avvia Scansione"');

  if (state.selectedFolders.length === 0) {
    logToMain('warn', 'Avvio scansione rifiutato: nessuna cartella selezionata');
    alert('Seleziona almeno una cartella da scansionare prima di procedere.');
    return;
  }

  const criteria = collectScanCriteria();
  if (!criteria) {
    logToMain('warn', 'Avvio scansione rifiutato: nessun parametro di confronto attivo');
    alert('Attiva almeno un parametro di confronto (consigliati: Stessa Dimensione + Hash Contenuto).');
    return;
  }

  logToMain('info', `Avvio scansione con criteri: ${JSON.stringify(criteria)}`);
  handleScanProgress.lastPhase = null;

  // Aggiorna stato UI
  state.isScanning = true;
  state.duplicateGroups = [];
  state.totalFilesScanned = 0;
  dom.btnStartScan.disabled = true;
  dom.btnCancelScan.style.display = 'inline-flex';
  dom.progressBarSection.style.display = 'flex';
  dom.progressTrack.className = 'progress-track indeterminate';
  dom.progressFillBar.style.width = '0%';
  dom.progressPercentText.textContent = '';
  dom.progressStatusDetail.textContent = 'Indicizzazione iniziale in corso...';
  dom.emptyPlaceholder.style.display = 'none';

  try {
    const results = await window.dupFinderAPI.startScan({
      directories: state.selectedFolders,
      criteria: criteria
    });

    state.duplicateGroups = results || [];
    logToMain('info', `Scansione completata con successo. Trovati ${state.duplicateGroups.length} gruppi.`);
    renderResults();
  } catch (err) {
    logToMain('error', `Errore durante la scansione: ${err.message}`);
    alert(`Errore durante la scansione: ${err.message}`);
  } finally {
    state.isScanning = false;
    dom.btnStartScan.disabled = false;
    dom.btnCancelScan.style.display = 'none';
    dom.progressBarSection.style.display = 'none';
  }
}

/**
 * Richiede l'interruzione della scansione.
 */
async function onCancelScanClick() {
  logToMain('info', 'Utente ha cliccato "Interrompi Scansione"');
  dom.progressStatusDetail.textContent = 'Interruzione in corso...';
  try {
    await window.dupFinderAPI.cancelScan();
  } catch (err) {
    logToMain('error', `Errore interruzione scansione: ${err.message}`);
  }
}

/**
 * Gestisce gli aggiornamenti di progresso inviati dal Main Process.
 * @param {Object} data 
 */
function handleScanProgress(data) {
  if (data.filesCount) {
    state.totalFilesScanned = data.filesCount;
  }

  // Log di debug per ogni cambio fase (il file di log diventa la "scatola nera" della scansione).
  if (data.phase && data.phase !== handleScanProgress.lastPhase) {
    logToMain('debug', `Progresso scansione: fase=${data.phase} file=${data.filesCount || 0}`);
    handleScanProgress.lastPhase = data.phase;
  }

  if (data.phase === 'collecting') {
    dom.progressTrack.className = 'progress-track indeterminate';
    dom.progressPhaseText.querySelector('span').textContent = 'Raccolta e indicizzazione file...';
    dom.progressStatusDetail.textContent = `${data.filesCount} file trovati: ${data.currentFile || ''}`;
  } else if (data.phase === 'grouping') {
    dom.progressTrack.className = 'progress-track indeterminate';
    dom.progressPhaseText.querySelector('span').textContent = 'Filtro e raggruppamento preliminare...';
    dom.progressStatusDetail.textContent = 'Analisi dei candidati duplicati...';
  } else if (data.phase === 'hashing') {
    dom.progressTrack.className = 'progress-track'; // Modalità deterministica
    const total = data.totalToHash || 1;
    const current = data.hashedCount || 0;
    const percent = Math.min(100, Math.round((current / total) * 100));

    dom.progressFillBar.style.width = `${percent}%`;
    dom.progressPercentText.textContent = `${percent}%`;
    dom.progressPhaseText.querySelector('span').textContent = `Calcolo Hash Crittografico (${current}/${total})...`;
    dom.progressStatusDetail.textContent = data.currentFile || '';
  }
}

// =========================================================================
// RENDERING DEI RISULTATI
// =========================================================================

/**
 * Mostra a schermo i gruppi di duplicati trovati e le statistiche aggregate.
 */
function renderResults() {
  // Svuota solo l'elenco gruppi: il placeholder resta nel DOM (bugfix stato vuoto).
  if (dom.resultsList) {
    dom.resultsList.innerHTML = '';
  }

  if (state.duplicateGroups.length === 0) {
    dom.statsBanner.style.display = 'none';
    dom.resultsToolbar.style.display = 'none';
    dom.emptyPlaceholder.style.display = 'flex';
    if (dom.emptyPlaceholderTitle) {
      dom.emptyPlaceholderTitle.textContent = 'Nessun duplicato trovato';
    }
    if (dom.emptyPlaceholderText) {
      dom.emptyPlaceholderText.textContent = 'Tutti i file analizzati nelle cartelle selezionate sono univoci secondo i criteri impostati.';
    }
    return;
  }

  // Calcolo statistiche
  let totalDuplicates = 0;
  let totalWastedBytes = 0;

  state.duplicateGroups.forEach(g => {
    totalDuplicates += (g.fileCount - 1);
    totalWastedBytes += g.wastedBytes;
  });

  // Aggiorna banner statistiche
  dom.statFilesScanned.textContent = state.totalFilesScanned || '-';
  dom.statGroupsCount.textContent = state.duplicateGroups.length;
  dom.statDuplicatesCount.textContent = totalDuplicates;
  dom.statWastedSpace.textContent = formatBytes(totalWastedBytes);

  dom.statsBanner.style.display = 'grid';
  dom.resultsToolbar.style.display = 'flex';
  dom.emptyPlaceholder.style.display = 'none';

  // Renderizza ciascun gruppo di duplicati
  state.duplicateGroups.forEach((group, groupIdx) => {
    const card = document.createElement('div');
    card.className = 'duplicate-group-card';
    card.id = `groupCard_${group.groupId}`;

    // Header del gruppo
    const header = document.createElement('div');
    header.className = 'group-header';
    header.innerHTML = `
      <div class="group-info">
        <span class="group-badge">Gruppo #${groupIdx + 1}</span>
        <span style="font-weight: 600; color: #fff;">${formatBytes(group.size)} ciascuno</span>
        <span class="group-hash" title="Hash Identificativo">${group.hash ? 'Hash: ' + group.hash.substring(0, 16) + '...' : ''}</span>
      </div>
      <div class="group-wasted">
        Spreco: ${formatBytes(group.wastedBytes)}
      </div>
    `;

    // Lista dei file del gruppo
    const list = document.createElement('div');
    list.className = 'group-files-list';

    group.files.forEach((file, fIdx) => {
      const isOriginal = (fIdx === 0);
      const row = document.createElement('div');
      row.className = `file-row ${isOriginal ? 'is-original' : ''}`;
      row.id = `fileRow_${group.groupId}_${fIdx}`;

      const dateStr = new Date(file.mtimeMs).toLocaleString();

      row.innerHTML = `
        <div class="file-main-info">
          <span class="file-tag ${isOriginal ? 'tag-original' : 'tag-duplicate'}">
            ${isOriginal ? 'Originale' : 'Duplicato'}
          </span>
          <span class="file-path-text" title="Clicca per mostrare nel file manager">${escapeHtml(file.path)}</span>
        </div>
        <div class="file-meta">
          <span>${dateStr}</span>
          <div class="file-actions">
            <button class="btn-icon" title="Mostra nella cartella" data-action="reveal" data-path="${escapeHtml(file.path)}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            </button>
            ${!isOriginal ? `
              <button class="btn-icon delete-hover" title="Elimina questo duplicato" data-action="delete" data-group="${group.groupId}" data-idx="${fIdx}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ''}
          </div>
        </div>
      `;

      // Clic sul path o sul bottone reveal
      row.querySelector('.file-path-text').addEventListener('click', () => {
        logToMain('info', `Reveal in file manager: ${file.path}`);
        window.dupFinderAPI.showItemInFolder(file.path);
      });
      row.querySelector('[data-action="reveal"]').addEventListener('click', () => {
        logToMain('info', `Reveal in file manager: ${file.path}`);
        window.dupFinderAPI.showItemInFolder(file.path);
      });

      // Clic sul bottone delete
      const deleteBtn = row.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          askDeleteSingleFile(group, fIdx);
        });
      }

      list.appendChild(row);
    });

    card.appendChild(header);
    card.appendChild(list);
    (dom.resultsList || dom.resultsScrollContainer).appendChild(card);
  });
}

// =========================================================================
// OPERAZIONI SU FILE (ELIMINAZIONE E PULIZIA)
// =========================================================================

/**
 * Richiede conferma per l'eliminazione di un singolo file duplicato.
 * @param {Object} group 
 * @param {number} fileIndex 
 */
function askDeleteSingleFile(group, fileIndex) {
  const file = group.files[fileIndex];
  openModal(
    'Elimina File Duplicato',
    `Sei sicuro di voler eliminare definitivamente il seguente file duplicato?<br><br><code style="color:#f87171; word-break:break-all;">${escapeHtml(file.path)}</code><br><br>Verrà recuperato <strong>${formatBytes(file.size)}</strong> di spazio. L'operazione è irreversibile.`,
    async () => {
      logToMain('info', `Confermata eliminazione file: ${file.path}`);
      const res = await window.dupFinderAPI.deleteFile(file.path);
      if (res.success) {
        logToMain('info', `File eliminato: ${file.path}`);
        // Rimuove il file dal gruppo nello stato
        group.files.splice(fileIndex, 1);
        group.fileCount--;
        group.wastedBytes = (group.fileCount - 1) * group.size;
        // Rimuove il gruppo se non ha più duplicati
        if (group.files.length <= 1) {
          state.duplicateGroups = state.duplicateGroups.filter(g => g.groupId !== group.groupId);
        }
        renderResults();
      } else {
        logToMain('error', `Errore eliminazione file "${file.path}": ${res.error}`);
        alert(`Impossibile eliminare il file: ${res.error}`);
      }
    }
  );
}

/**
 * Esegue la pulizia automatica di tutti i duplicati lasciando solo l'originale di ogni gruppo.
 */
function onBatchCleanClick() {
  if (state.duplicateGroups.length === 0) return;

  let totalFilesToDelete = 0;
  let totalBytesToFree = 0;

  state.duplicateGroups.forEach(g => {
    totalFilesToDelete += (g.fileCount - 1);
    totalBytesToFree += g.wastedBytes;
  });

  openModal(
    'Pulizia Rapida Duplicati',
    `Questa operazione eliminerà automaticamente <strong>${totalFilesToDelete} file duplicati</strong>, conservando la copia originale contrassegnata in verde per ogni gruppo.<br><br>Spazio stimato recuperabile: <strong style="color:#38bdf8;">${formatBytes(totalBytesToFree)}</strong>.<br><br>Sei sicuro di voler procedere?`,
    async () => {
      logToMain('info', `Avvio batch clean su ${totalFilesToDelete} file duplicati.`);
      let deletedCount = 0;
      let errorCount = 0;

      for (const group of [...state.duplicateGroups]) {
        for (let i = group.files.length - 1; i >= 1; i--) {
          const file = group.files[i];
          const res = await window.dupFinderAPI.deleteFile(file.path);
          if (res.success) {
            deletedCount++;
            group.files.splice(i, 1);
          } else {
            errorCount++;
            logToMain('warn', `Fallita eliminazione automatica di "${file.path}": ${res.error}`);
          }
        }
      }

      // Rimuove i gruppi che non hanno più duplicati
      state.duplicateGroups = state.duplicateGroups.filter(g => g.files.length > 1);
      renderResults();

      alert(`Pulizia completata!\n${deletedCount} file eliminati con successo.${errorCount > 0 ? `\n${errorCount} file non sono stati eliminati per problemi di permessi.` : ''}`);
    }
  );
}

// =========================================================================
// ESPORTAZIONE REPORT E FILE DI LOG
// =========================================================================

/**
 * Gestisce l'esportazione dei risultati in formato JSON o CSV.
 * @param {'json'|'csv'} format 
 */
async function onExportReport(format) {
  if (state.duplicateGroups.length === 0) {
    alert('Nessun risultato da esportare.');
    return;
  }
  logToMain('info', `Utente richiede esportazione report in formato ${format}`);
  try {
    const res = await window.dupFinderAPI.exportReport(format, state.duplicateGroups);
    if (res.success) {
      logToMain('info', `Report esportato in: ${res.path}`);
      alert(`Report esportato con successo in:\n${res.path}`);
    } else if (res.canceled) {
      logToMain('info', 'Esportazione annullata dall\'utente');
    } else {
      alert(`Errore esportazione report: ${res.error}`);
    }
  } catch (err) {
    logToMain('error', `Errore esportazione: ${err.message}`);
  }
}

/**
 * Mostra il percorso del file di log su disco per agevolare il troubleshooting.
 */
async function onShowLogPathClick() {
  logToMain('info', 'Utente ha cliccato "File di Log"');
  try {
    const logPath = await window.dupFinderAPI.getLogPath();
    openModal(
      'File di Log di DupFinder',
      `Tutte le operazioni, le scansioni e gli eventuali errori vengono registrati in modo persistente nel seguente file:<br><br><code style="color:#38bdf8; word-break:break-all;">${escapeHtml(logPath)}</code><br><br>Puoi allegare questo file su GitHub se riscontri problemi per una rapida diagnosi.`,
      null // Solo informativa, nessun pulsante di conferma eliminazione
    );
  } catch (err) {
    console.error('Errore percorso log:', err);
  }
}

/**
 * Apre il pannello Guida con il README incluso nel programma.
 */
async function onShowGuideClick() {
  logToMain('info', 'Utente ha aperto la Guida (README incluso)');
  dom.guideOverlay.hidden = false;
  if (dom.guideContent.dataset.loaded === '1') {
    return;
  }
  dom.guideContent.innerHTML = '<p class="guide-loading">Caricamento del manuale…</p>';
  try {
    const res = await window.dupFinderAPI.getReadme();
    if (!res.success) {
      throw new Error(res.error || 'README non disponibile');
    }
    const toHtml = (window.DupFinderMarkdown && window.DupFinderMarkdown.markdownToHtml)
      ? window.DupFinderMarkdown.markdownToHtml
      : (text) => `<pre>${escapeHtml(text)}</pre>`;
    dom.guideContent.innerHTML = toHtml(res.content);
    dom.guideContent.dataset.loaded = '1';
    logToMain('info', `README caricato da ${res.path}`);
  } catch (err) {
    logToMain('error', `Impossibile aprire la Guida: ${err.message}`);
    dom.guideContent.innerHTML = `<p>Impossibile caricare il manuale README.</p><p>${escapeHtml(err.message)}</p>`;
  }
}

function closeGuide() {
  logToMain('info', 'Utente ha chiuso la Guida');
  dom.guideOverlay.hidden = true;
}

async function onOpenReadmeFileClick() {
  logToMain('info', 'Utente chiede di aprire README.md nel visualizzatore di sistema');
  try {
    const res = await window.dupFinderAPI.openReadme();
    if (!res.success) {
      alert(`Impossibile aprire README.md:\n${res.error || 'file non trovato'}`);
    }
  } catch (err) {
    alert(`Impossibile aprire README.md:\n${err.message}`);
  }
}

// =========================================================================
// MODALE E UTILITIES
// =========================================================================

function openModal(title, messageHtml, confirmAction) {
  dom.modalTitle.textContent = title;
  dom.modalMessage.innerHTML = messageHtml;
  state.pendingModalAction = confirmAction;

  if (!confirmAction) {
    dom.btnModalConfirm.style.display = 'none';
    dom.btnModalCancel.textContent = 'Chiudi';
  } else {
    dom.btnModalConfirm.style.display = 'inline-flex';
    dom.btnModalCancel.textContent = 'Annulla';
  }

  dom.confirmModal.style.display = 'flex';
}

function closeModal() {
  dom.confirmModal.style.display = 'none';
  state.pendingModalAction = null;
}

function confirmModalAction() {
  if (typeof state.pendingModalAction === 'function') {
    const action = state.pendingModalAction;
    closeModal();
    action();
  } else {
    closeModal();
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
