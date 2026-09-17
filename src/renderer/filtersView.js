/**
 * @file filtersView.js
 * @description Criteri di scansione, Azzera Filtri / Azzera Ricerca.
 * Nessun criterio è spuntato di default. Scan senza criteri → modale a tema.
 */
'use strict';

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
 * True se una scansione è in corso: i reset non devono partire a metà walk.
 *
 * @returns {boolean}
 */
function isResetBlocked() {
  if (state.isScanning) {
    uiAlert(t('alert.resetBusy'), 'warning');
    logToMain('warn', 'Reset rifiutato: scansione in corso');
    return true;
  }
  return false;
}

/**
 * Ripristina i parametri di confronto e i filtri avanzati: **nessun**
 * criterio di confronto spuntato. L'utente deve attivarli esplicitamente.
 *
 * @returns {void}
 */
function restoreDefaultFilters() {
  if (dom.chkMatchSize) {
    dom.chkMatchSize.checked = false;
  }
  if (dom.chkMatchHash) {
    dom.chkMatchHash.checked = false;
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
}

/**
 * Pulsante «Azzera Filtri»: solo criteri e filtri avanzati.
 * Le cartelle in elenco e i duplicati già trovati restano visibili.
 *
 * @returns {void}
 */
function resetFilters() {
  try {
    if (isResetBlocked()) {
      return;
    }
    restoreDefaultFilters();
    logToMain('info', t('log.resetFilters'));
  } catch (err) {
    logToMain('error', 'Azzera Filtri fallito: ' + err.message);
  }
}

/**
 * Nasconde barra di avanzamento, statistiche e toolbar risultati e
 * ripristina il placeholder iniziale a destra.
 *
 * @returns {void}
 */
function clearResultsPanel() {
  state.duplicateGroups = [];
  state.totalFilesScanned = 0;
  state.selectedPaths = {};
  state.collapsedReasons = {};
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
  if (dom.progressFillBar) {
    dom.progressFillBar.style.width = '0%';
  }
  if (dom.progressPercentText) {
    dom.progressPercentText.textContent = '0%';
  }
  if (dom.progressStatusDetail) {
    dom.progressStatusDetail.textContent = '';
  }
  if (dom.emptyPlaceholder) {
    dom.emptyPlaceholder.style.display = 'flex';
  }
  if (dom.emptyPlaceholderTitle) {
    dom.emptyPlaceholderTitle.textContent = t('results.emptyTitle');
  }
  if (dom.emptyPlaceholderText) {
    dom.emptyPlaceholderText.textContent = t('results.emptyText');
  }
}

/**
 * Pulsante «Azzera Ricerca»: pulisce solo i risultati a destra.
 * Le cartelle già caricate restano, così si può rilanciare subito la scansione.
 *
 * @returns {void}
 */
function resetSearch() {
  try {
    if (isResetBlocked()) {
      return;
    }
    const folderCount = state.selectedFolders.length;
    clearResultsPanel();
    logToMain('info', t('log.resetSearch') + ' (cartelle conservate: ' + folderCount + ')');
  } catch (err) {
    logToMain('error', 'Azzera Ricerca fallito: ' + err.message);
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
