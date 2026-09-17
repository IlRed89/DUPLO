/**
 * @file i18n.js
 * @description Dizionari e helper di traduzione per DUPLO (IT default, EN, ES, FR).
 *
 * Condiviso tra Main (test Node via `require`) e Renderer (script UMD).
 * Nel Renderer i JSON in `src/locales/` si caricano con `fetch` relativo;
 * in Node si `require` diretto. Ogni chiave presente in `it.json` deve
 * esistere anche negli altri tre file (verificato da `i18n.test.js`).
 *
 * Perché un modulo dedicato: il cambio lingua deve aggiornare *tutti* i
 * nodi `data-i18n*` del DOM in un colpo solo, senza ricaricare la finestra.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.DuploI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** Lingue supportate. Italiano è il default di prodotto. */
  const SUPPORTED_LANGS = ['it', 'en', 'es', 'fr'];
  /** Chiave `localStorage` della preferenza lingua. */
  const STORAGE_KEY = 'duplo.lang';
  /** Ordine di presentazione delle macro-sezioni risultati. */
  const MATCH_REASON_ORDER = ['hash', 'size', 'name', 'fuzzy'];

  /** @type {Record<string, Record<string, string>>} */
  const dictionaries = Object.create(null);
  /** @type {'it'|'en'|'es'|'fr'} */
  let currentLang = 'it';

  /**
   * Carica i quattro JSON da disco (solo ambiente Node / test).
   * @returns {void}
   */
  function loadFromDisk() {
    try {
      if (typeof require !== 'function') {
        return;
      }
      dictionaries.it = require('./locales/it.json');
      dictionaries.en = require('./locales/en.json');
      dictionaries.es = require('./locales/es.json');
      dictionaries.fr = require('./locales/fr.json');
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[i18n] Impossibile caricare i JSON da disco:', err && err.message);
      }
    }
  }

  loadFromDisk();

  /**
   * Normalizza un codice lingua (`it-IT` → `it`). Qualsiasi valore
   * non supportato torna all'italiano.
   *
   * @param {unknown} lang
   * @returns {'it'|'en'|'es'|'fr'}
   */
  function normalizeLanguage(lang) {
    try {
      const raw = String(lang || 'it').trim().toLowerCase();
      const short = raw.split(/[-_]/)[0];
      if (SUPPORTED_LANGS.indexOf(short) !== -1) {
        return /** @type {'it'|'en'|'es'|'fr'} */ (short);
      }
    } catch (_err) {
      /* ignore */
    }
    return 'it';
  }

  /**
   * Registra (o sovrascrive) il dizionario di una lingua.
   * Usato dal Renderer dopo il `fetch` dei JSON.
   *
   * @param {unknown} lang
   * @param {Record<string, string>} dict
   * @returns {void}
   */
  function registerDictionary(lang, dict) {
    const code = normalizeLanguage(lang);
    if (!dict || typeof dict !== 'object') {
      return;
    }
    dictionaries[code] = dict;
  }

  /**
   * Imposta la lingua corrente (senza toccare il DOM).
   *
   * @param {unknown} lang
   * @returns {'it'|'en'|'es'|'fr'}
   */
  function setLanguage(lang) {
    currentLang = normalizeLanguage(lang);
    return currentLang;
  }

  /**
   * @returns {'it'|'en'|'es'|'fr'}
   */
  function getLanguage() {
    return currentLang;
  }

  /**
   * Traduce una chiave interpolando `{placeholder}`.
   * Fallback: dizionario italiano, poi la chiave grezza.
   *
   * @param {string} key
   * @param {Record<string, string|number>} [vars]
   * @returns {string}
   */
  function t(key, vars) {
    const dict = dictionaries[currentLang] || dictionaries.it || {};
    const it = dictionaries.it || {};
    let out = dict[key];
    if (typeof out !== 'string') {
      out = it[key];
    }
    if (typeof out !== 'string') {
      out = String(key || '');
    }
    if (vars && typeof vars === 'object') {
      Object.keys(vars).forEach(function (name) {
        out = out.split('{' + name + '}').join(String(vars[name]));
      });
    }
    return out;
  }

  /**
   * Aggiorna tutti i nodi con attributi `data-i18n*`.
   * - `data-i18n` → textContent
   * - `data-i18n-html` → innerHTML (solo stringhe del dizionario, mai input utente)
   * - `data-i18n-placeholder` → placeholder
   * - `data-i18n-title` → title
   * - `data-i18n-aria` → aria-label
   *
   * @param {Document|ParentNode} [root]
   * @returns {number} Nodi aggiornati.
   */
  function applyToDocument(root) {
    const doc = root || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.querySelectorAll !== 'function') {
      return 0;
    }
    let count = 0;

    function each(attr, apply) {
      const nodes = doc.querySelectorAll('[' + attr + ']');
      for (let i = 0; i < nodes.length; i += 1) {
        const el = nodes[i];
        const key = el.getAttribute(attr);
        if (!key) {
          continue;
        }
        apply(el, t(key));
        count += 1;
      }
    }

    each('data-i18n', function (el, value) {
      el.textContent = value;
    });
    each('data-i18n-html', function (el, value) {
      el.innerHTML = value;
    });
    each('data-i18n-placeholder', function (el, value) {
      el.setAttribute('placeholder', value);
    });
    each('data-i18n-title', function (el, value) {
      el.setAttribute('title', value);
    });
    each('data-i18n-aria', function (el, value) {
      el.setAttribute('aria-label', value);
    });

    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = currentLang;
    }
    if (typeof document !== 'undefined' && document.title) {
      document.title = t('app.title');
    }
    return count;
  }

  /**
   * Elenco chiavi del dizionario italiano (sorgente di verità).
   * @returns {string[]}
   */
  function italianKeys() {
    return Object.keys(dictionaries.it || {}).sort();
  }

  /**
   * Confronta le chiavi di una lingua con l'italiano.
   *
   * @param {unknown} lang
   * @returns {{ missing: string[], extra: string[] }}
   */
  function diffKeys(lang) {
    const code = normalizeLanguage(lang);
    const itKeys = italianKeys();
    const other = Object.keys(dictionaries[code] || {});
    const itSet = {};
    itKeys.forEach(function (k) {
      itSet[k] = true;
    });
    const otherSet = {};
    other.forEach(function (k) {
      otherSet[k] = true;
    });
    return {
      missing: itKeys.filter(function (k) {
        return !otherSet[k];
      }),
      extra: other.filter(function (k) {
        return !itSet[k];
      })
    };
  }

  return {
    SUPPORTED_LANGS: SUPPORTED_LANGS.slice(),
    MATCH_REASON_ORDER: MATCH_REASON_ORDER.slice(),
    STORAGE_KEY,
    normalizeLanguage,
    registerDictionary,
    setLanguage,
    getLanguage,
    t,
    applyToDocument,
    italianKeys,
    diffKeys,
    dictionaries
  };
});
