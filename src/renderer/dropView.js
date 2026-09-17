/**
 * @file dropView.js
 * @description Overlay drag & drop a tutta finestra (contatore anti-flicker).
 * Caricato dopo `renderer.js`. Contratto path: consumeDroppedPaths / getPathForFile.
 */
'use strict';

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
      uiAlert(t('alert.dropNoPath'), 'warning');
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
      uiAlert(t('alert.dropNoFolder'), 'warning');
    }
  } catch (err) {
    logToMain('error', 'Errore drag & drop: ' + err.message);
  }
}
