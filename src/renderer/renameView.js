/**
 * @file renameView.js
 * @description Catena di rinomina DUPLO: event delegation + DuploDialog + IPC.
 *
 * I risultati sono ridisegnati ad ogni toggle: i listener sui singoli bottoni
 * si perdevano o restavano appesi. Un solo listener sul container stabile
 * `#resultsScrollContainer` intercetta `.btn-rename` (anche se il click
 * arriva su un figlio del bottone).
 *
 * Caricato dopo `actionsView.js` (usa `fileNameFromPath`, `uiAlert`, `t`).
 */
'use strict';

/** True mentre un prompt di rinomina è aperto o l'IPC è in volo. */
let renameChainBusy = false;

/**
 * Aggancia la delegation una sola volta sul container risultati (non sulle righe).
 * Il DOM del container esiste già: gli script stanno in fondo a `index.html`.
 *
 * @returns {void}
 */
function bindResultsActionDelegation() {
  const host = document.getElementById('resultsScrollContainer') || (typeof dom !== 'undefined' ? dom.resultsScrollContainer : null);
  if (!host) {
    logToMain('error', '[Rename] #resultsScrollContainer assente: delegation non agganciata');
    return;
  }
  if (host.getAttribute('data-duplo-actions-bound') === '1') {
    logToMain('debug', '[Rename] delegation già agganciata, skip');
    return;
  }
  host.setAttribute('data-duplo-actions-bound', '1');
  host.addEventListener('click', onResultsContainerClick);
  host.addEventListener('keydown', onResultsContainerKeydown);
  logToMain('info', '[Rename] event delegation agganciata su #resultsScrollContainer');
}

/**
 * Click delegato: rinomina, elimina, apri percorso.
 *
 * @param {MouseEvent} event
 * @returns {void}
 */
function onResultsContainerClick(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') {
    return;
  }

  const renameBtn = target.closest('.btn-rename');
  if (renameBtn) {
    event.preventDefault();
    event.stopPropagation();
    const filePath = renameBtn.getAttribute('data-path') || '';
    const currentName = renameBtn.getAttribute('data-name') || '';
    logToMain('info', '[Rename] click delegato path="' + filePath + '" name="' + currentName + '"');
    askRenameFileByPath(filePath, currentName);
    return;
  }

  const deleteBtn = target.closest('.btn-delete-file');
  if (deleteBtn) {
    event.preventDefault();
    event.stopPropagation();
    const filePath = deleteBtn.getAttribute('data-path') || '';
    const fileIndex = parseInt(deleteBtn.getAttribute('data-file-index'), 10);
    const groupId = deleteBtn.getAttribute('data-group-id');
    logToMain('info', '[Delete] click delegato path="' + filePath + '"');
    const found = findFileInState(filePath, groupId, fileIndex);
    if (found) {
      askDeleteSingleFile(found.group, found.fileIndex);
    } else {
      logToMain('warn', '[Delete] riga non trovata in state per "' + filePath + '"');
    }
    return;
  }

  const pathEl = target.closest('.file-path-text');
  if (pathEl) {
    const filePath = pathEl.getAttribute('data-path') || pathEl.getAttribute('title') || '';
    if (filePath) {
      openFilePath(filePath);
    }
  }
}

/**
 * Enter/Spazio sul path cliccabile.
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function onResultsContainerKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  const target = event.target;
  if (!target || typeof target.closest !== 'function') {
    return;
  }
  const pathEl = target.closest('.file-path-text');
  if (!pathEl) {
    return;
  }
  event.preventDefault();
  const filePath = pathEl.getAttribute('data-path') || pathEl.getAttribute('title') || '';
  if (filePath) {
    openFilePath(filePath);
  }
}

/**
 * Trova il file in `state.duplicateGroups` per path (o groupId + indice).
 *
 * @param {string} filePath
 * @param {string} [groupId]
 * @param {number} [fileIndex]
 * @returns {{ group: Object, file: Object, fileIndex: number }|null}
 */
function findFileInState(filePath, groupId, fileIndex) {
  const groups = (typeof state !== 'undefined' && state.duplicateGroups) ? state.duplicateGroups : [];
  const wantPath = String(filePath || '');
  let i;
  for (i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const files = group && group.files ? group.files : [];
    if (groupId && String(group.groupId) === String(groupId) && files[fileIndex]) {
      return { group: group, file: files[fileIndex], fileIndex: fileIndex };
    }
    let f;
    for (f = 0; f < files.length; f += 1) {
      if (files[f] && files[f].path === wantPath) {
        return { group: group, file: files[f], fileIndex: f };
      }
    }
  }
  return null;
}

/**
 * Apre il prompt a tema, chiama `rename-file`, aggiorna stato e DOM.
 * Non usa `window.prompt` (in Electron è silenzioso / non tematico).
 *
 * @param {string} filePath Path assoluto attuale.
 * @param {string} currentName Basename visibile (senza cartella).
 * @returns {Promise<void>}
 */
async function askRenameFileByPath(filePath, currentName) {
  const oldPath = String(filePath || '').trim();
  const shownName = String(currentName || fileNameFromPath(oldPath) || '').trim();

  if (!oldPath) {
    logToMain('warn', '[Rename] path vuoto: nessuna rinomina');
    await uiAlert(t('alert.renameFail', { error: 'percorso file mancante' }), 'error');
    return;
  }
  if (renameChainBusy) {
    logToMain('warn', '[Rename] ignorato: operazione già in corso per un altro file');
    return;
  }
  renameChainBusy = true;
  try {
    if (!window.DuploDialog || typeof window.DuploDialog.prompt !== 'function') {
      logToMain('error', '[Rename] DuploDialog.prompt assente');
      await uiAlert(t('alert.renameFail', { error: 'dialogo a tema non disponibile' }), 'error');
      return;
    }
    const overlay = document.getElementById('confirmModal');
    if (!overlay) {
      logToMain('error', '[Rename] #confirmModal assente nel DOM');
      await uiAlert(t('alert.renameFail', { error: 'modale #confirmModal non trovato' }), 'error');
      return;
    }

    logToMain('info', '[Rename] apertura prompt per "' + oldPath + '" (nome="' + shownName + '")');
    const nextName = await window.DuploDialog.prompt({
      title: t('modal.renameTitle'),
      message: t('alert.renamePrompt'),
      value: shownName,
      confirmLabel: t('modal.renameConfirm')
    });
    if (nextName == null) {
      logToMain('info', '[Rename] annullato dall\'utente');
      return;
    }
    const trimmed = String(nextName).trim();
    if (!trimmed) {
      await uiAlert(t('alert.renameEmpty'), 'warning');
      return;
    }
    if (trimmed === shownName) {
      logToMain('info', '[Rename] nome invariato per "' + oldPath + '"');
      return;
    }
    if (!window.duploAPI || typeof window.duploAPI.renameFile !== 'function') {
      logToMain('error', '[Rename] duploAPI.renameFile assente (preload)');
      await uiAlert(t('alert.renameFail', { error: 'API renameFile non esposta dal preload' }), 'error');
      return;
    }

    logToMain('info', '[Rename] IPC rename-file "' + oldPath + '" → "' + trimmed + '"');
    const res = await window.duploAPI.renameFile(oldPath, trimmed);
    if (!res || !res.success) {
      const reason = (res && res.error) || 'unknown';
      const code = (res && res.code) ? ' [' + res.code + ']' : '';
      logToMain('error', '[Rename] fallito' + code + ': ' + reason);
      await uiAlert(t('alert.renameFail', { error: reason }), 'error');
      return;
    }
    const newPath = res.newPath || (dirNameFromPath(oldPath) + '/' + trimmed);
    applyRenameToState(oldPath, newPath);
    logToMain('info', '[Rename] ok visibile path="' + newPath + '"');
    renderResults();
  } catch (err) {
    logToMain('error', '[Rename] eccezione: ' + (err && err.message));
    await uiAlert(t('alert.renameFail', { error: (err && err.message) || String(err) }), 'error');
  } finally {
    renameChainBusy = false;
  }
}

/**
 * Aggiorna path/nome in RAM e la selezione, senza rifare la scansione.
 *
 * @param {string} oldPath
 * @param {string} newPath
 * @returns {void}
 */
function applyRenameToState(oldPath, newPath) {
  const found = findFileInState(oldPath);
  const wasSelected = typeof state !== 'undefined' && state.selectedPaths && state.selectedPaths[oldPath];
  if (typeof state !== 'undefined' && state.selectedPaths) {
    delete state.selectedPaths[oldPath];
    if (wasSelected) {
      state.selectedPaths[newPath] = true;
    }
  }
  if (found && found.file) {
    found.file.path = newPath;
    found.file.name = fileNameFromPath(newPath);
  }
}

/**
 * Compat: rinomina da gruppo + indice (chiamate residue).
 *
 * @param {Object} group
 * @param {number} fileIndex
 * @returns {Promise<void>}
 */
async function askRenameFile(group, fileIndex) {
  const file = group && group.files ? group.files[fileIndex] : null;
  if (!file || !file.path) {
    logToMain('warn', '[Rename] file assente all\'indice ' + fileIndex);
    return;
  }
  return askRenameFileByPath(file.path, fileNameFromPath(file.path));
}

bindResultsActionDelegation();
