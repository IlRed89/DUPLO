/**
 * @file formatBytes.js
 * @description Formattazione dimensioni in unità IEC-approssimate (1024).
 * Condiviso tra Renderer (statistiche UI) e test per un solo algoritmo.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.DuploFormatBytes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

  /**
   * Converte un numero di byte in stringa leggibile (`1.50 MB`).
   * Valori non finiti o negativi → `0 B`.
   *
   * @param {unknown} bytes
   * @returns {string}
   */
  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) {
      return '0 B';
    }
    const k = 1024;
    const i = Math.min(UNITS.length - 1, Math.floor(Math.log(n) / Math.log(k)));
    const value = n / Math.pow(k, i);
    return value.toFixed(2) + ' ' + UNITS[i];
  }

  return { formatBytes };
});
