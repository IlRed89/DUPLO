/**
 * @file prefsView.js
 * @description Preferenze UI di DUPLO: criteri, lingua, tema, categoria, splitter.
 * Caricato dopo `renderer.js`. Usa `state`, `dom`, `t`, `logToMain`.
 */
'use strict';

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
