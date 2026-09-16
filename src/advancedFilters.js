/**
 * @file advancedFilters.js
 * @description Fase 6.0 — parsing e normalizzazione dei filtri "Ricerca Avanzata".
 * Usato dal Renderer (script tag), dal Main Process e dai test Node (module.exports).
 *
 * Responsabilità:
 * - interpretare l'elenco di estensioni digitato a mano (".txt, csv");
 * - convertire KB/MB in byte;
 * - trasformare gli input `type="date"` in timestamp locali (inizio/fine giornata);
 * - decidere se la lista custom sostituisce la categoria generale.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.DuploAdvancedFilters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const KB = 1024;
  const MB = 1024 * 1024;

  /**
   * Spezza una stringa utente in estensioni normalizzate (minuscole, con il punto).
   * Accetta virgole, punti e virgola e spazi: `.txt, csv;PDF`.
   *
   * @param {unknown} raw
   * @returns {string[]}
   */
  function parseExtensionList(raw) {
    if (raw == null) {
      return [];
    }
    const text = String(raw).trim();
    if (!text) {
      return [];
    }
    const parts = text.split(/[,;\s]+/);
    const normalized = [];
    const seen = Object.create(null);
    for (let i = 0; i < parts.length; i += 1) {
      let token = parts[i].trim().toLowerCase();
      if (!token) {
        continue;
      }
      // Rimuove caratteri che non appartengono a un'estensione (path traversal / glob).
      token = token.replace(/[^a-z0-9.]+/g, '');
      if (!token || token === '.') {
        continue;
      }
      if (token.charAt(0) !== '.') {
        token = '.' + token;
      }
      if (seen[token]) {
        continue;
      }
      seen[token] = true;
      normalized.push(token);
    }
    return normalized;
  }

  /**
   * Converte un valore numerico + unità (kb|mb) in byte interi.
   * Valori vuoti, negativi o non numerici → 0 ("nessun limite").
   *
   * @param {unknown} value
   * @param {unknown} unit
   * @returns {number}
   */
  function sizeToBytes(value, unit) {
    const n = typeof value === 'number' ? value : parseFloat(String(value == null ? '' : value).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      return 0;
    }
    const u = String(unit || 'kb').trim().toLowerCase();
    const mul = u === 'mb' ? MB : KB;
    return Math.round(n * mul);
  }

  /**
   * Interpreta `YYYY-MM-DD` come istante locale.
   * `endOfDay=false` → 00:00:00.000; `true` → 23:59:59.999.
   *
   * @param {unknown} value
   * @param {boolean} endOfDay
   * @returns {number} epoch ms, oppure 0 se assente/invalido
   */
  function dateInputToMs(value, endOfDay) {
    if (value == null) {
      return 0;
    }
    const text = String(value).trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) {
      return 0;
    }
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const dt = endOfDay
      ? new Date(year, month, day, 23, 59, 59, 999)
      : new Date(year, month, day, 0, 0, 0, 0);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  /**
   * Se entrambe le date sono valorizzate e "dal" > "fino al", le scambia
   * (l'utente ha invertito i campi: non facciamo fallire la scansione).
   *
   * @param {number} afterMs
   * @param {number} beforeMs
   * @returns {{ modifiedAfterMs: number, modifiedBeforeMs: number, swapped: boolean }}
   */
  function normalizeDateRange(afterMs, beforeMs) {
    let after = Number(afterMs) || 0;
    let before = Number(beforeMs) || 0;
    let swapped = false;
    if (after > 0 && before > 0 && after > before) {
      const tmp = after;
      after = before;
      before = tmp;
      swapped = true;
    }
    return { modifiedAfterMs: after, modifiedBeforeMs: before, swapped };
  }

  /**
   * La lista custom ha priorità sulla categoria (Immagini/Audio/…).
   * Array vuoto = nessun filtro estensione.
   *
   * @param {unknown} customExts
   * @param {unknown} categoryExts
   * @returns {{ includeExtensions: string[], usedCustom: boolean }}
   */
  function resolveIncludeExtensions(customExts, categoryExts) {
    const custom = Array.isArray(customExts) ? customExts.filter(Boolean) : [];
    if (custom.length > 0) {
      return { includeExtensions: custom.slice(), usedCustom: true };
    }
    const category = Array.isArray(categoryExts) ? categoryExts.filter(Boolean) : [];
    return { includeExtensions: category.slice(), usedCustom: false };
  }

  return {
    KB,
    MB,
    parseExtensionList,
    sizeToBytes,
    dateInputToMs,
    normalizeDateRange,
    resolveIncludeExtensions
  };
});
