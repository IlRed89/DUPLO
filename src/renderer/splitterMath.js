/**
 * @file splitterMath.js
 * @description Calcolo della larghezza della sidebar durante il drag dello splitter.
 * Separato dal DOM così la formula è testabile senza Electron.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.DuploSplitterMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIN_SIDEBAR_PX = 280;
  const MIN_MAIN_PX = 320;

  /**
   * Nuova larghezza sidebar = larghezza iniziale + spostamento orizzontale del mouse,
   * limitata così che né la sidebar né l'area risultati scendano sotto i minimi.
   *
   * newWidth = clamp(startWidth + deltaX, MIN_SIDEBAR, containerWidth - MIN_MAIN)
   *
   * @param {number} startWidth - Larghezza della sidebar al mousedown (px)
   * @param {number} deltaX - clientX attuale − clientX iniziale (positivo = verso destra)
   * @param {number} containerWidth - Larghezza di `.app-body`
   * @returns {number} Larghezza intera in pixel
   */
  function clampSidebarWidth(startWidth, deltaX, containerWidth) {
    const raw = Number(startWidth) + Number(deltaX);
    const maxSidebar = Math.max(MIN_SIDEBAR_PX, Number(containerWidth) - MIN_MAIN_PX);
    const clamped = Math.min(maxSidebar, Math.max(MIN_SIDEBAR_PX, raw));
    return Math.round(clamped);
  }

  return { MIN_SIDEBAR_PX, MIN_MAIN_PX, clampSidebarWidth };
});
