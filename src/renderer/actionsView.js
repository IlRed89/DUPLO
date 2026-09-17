/**
 * @file actionsView.js
 * @description Avvio/annullo scansione, rinomina IPC, delete, pulizia, guida.
 * Rename usa DuploDialog.prompt (niente window.prompt). Export JSON/CSV assente.
 */
'use strict';

/**
 * Avvia la scansione. Cartelle e criteri vuoti si intercettano qui
 * (modale a tema), così il Main non riceve Promise rejection inutili.
 *
 * @returns {Promise<void>}
 */
async function onStartScanClick() {
  logToMain('info', t('log.scanStart'));
  if (state.selectedFolders.length === 0) {
    await uiAlert(t('alert.needFolder'), 'warning');
    return;
  }
  const criteria = collectScanCriteria();
  if (!criteria) {
    await uiAlert(t('alert.needCriteria'), 'warning');
    logToMain('warn', 'Scansione rifiutata: nessun criterio di confronto attivo');
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
    await uiAlert(t('alert.scanError', { error: err.message }), 'error');
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
 * Chiede conferma e elimina un singolo file del gruppo.
 *
 * @param {Object} group
 * @param {number} fileIndex
 * @returns {Promise<void>}
 */
async function askDeleteSingleFile(group, fileIndex) {
  const file = group.files[fileIndex];
  const ok = await uiConfirm(
    t('modal.deleteTitle'),
    t('modal.deleteBody', { path: '<br><code>' + escapeHtml(file.path) + '</code>' })
  );
  if (!ok) {
    logToMain('info', '[Delete] singolo file annullato');
    return;
  }
  const res = await window.duploAPI.deleteFile(file.path);
  if (res.success) {
    logToMain('info', '[Delete] rimosso "' + file.path + '"');
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
    await uiAlert(t('alert.deleteFail', { error: res.error }), 'error');
  }
}

/**
 * Elimina i file spuntati (File #1 resta fuori dalla selezione rapida).
 * @returns {Promise<void>}
 */
async function onDeleteSelectedClick() {
  const selected = Object.keys(state.selectedPaths).filter(function (p) {
    return state.selectedPaths[p];
  });
  if (selected.length === 0) {
    await uiAlert(t('alert.noSelection'), 'warning');
    return;
  }
  const ok = await uiConfirm(
    t('modal.selectedTitle'),
    t('modal.selectedBody', { count: selected.length })
  );
  if (!ok) {
    logToMain('info', '[Delete] selezione annullata');
    return;
  }
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
  logToMain('info', '[Delete] selezionati: ok=' + deletedCount + ' err=' + errorCount);
  renderResults();
  await uiAlert(t('alert.cleanDone', {
    deleted: deletedCount,
    errors: errorCount ? t('alert.cleanErrors', { count: errorCount }) : ''
  }), errorCount ? 'warning' : 'info');
}

/**
 * Elimina dal 2° file in poi di ogni gruppo (File #1 resta).
 * @returns {Promise<void>}
 */
async function onBatchCleanClick() {
  if (state.duplicateGroups.length === 0) {
    return;
  }
  let totalFilesToDelete = 0;
  let totalBytesToFree = 0;
  state.duplicateGroups.forEach(function (g) {
    totalFilesToDelete += (g.fileCount - 1);
    totalBytesToFree += g.wastedBytes;
  });
  const ok = await uiConfirm(
    t('modal.batchTitle'),
    t('modal.batchBody', { count: totalFilesToDelete, size: formatBytes(totalBytesToFree) })
  );
  if (!ok) {
    logToMain('info', '[Delete] pulizia rapida annullata');
    return;
  }
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
  logToMain('info', '[Delete] pulizia rapida: ok=' + deletedCount + ' err=' + errorCount);
  renderResults();
  await uiAlert(t('alert.cleanDone', {
    deleted: deletedCount,
    errors: errorCount ? t('alert.cleanErrors', { count: errorCount }) : ''
  }), errorCount ? 'warning' : 'info');
}

/**
 * Mostra il percorso del file di log.
 * @returns {Promise<void>}
 */
async function onShowLogPathClick() {
  try {
    const logPath = await window.duploAPI.getLogPath();
    logToMain('info', '[Dialog] percorso log: ' + logPath);
    await window.DuploDialog.alert({
      kind: 'info',
      title: t('modal.logsTitle'),
      message: t('modal.logsBody', { path: '<br><code>' + escapeHtml(logPath) + '</code>' }),
      html: true,
      confirmLabel: t('modal.close')
    });
  } catch (err) {
    logToMain('error', 'Errore percorso log: ' + err.message);
    await uiAlert(t('alert.readmeFail', { error: err.message }), 'error');
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
      await uiAlert(t('alert.readmeFail', { error: res.error || 'file non trovato' }), 'error');
    }
  } catch (err) {
    await uiAlert(t('alert.readmeFail', { error: err.message }), 'error');
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
