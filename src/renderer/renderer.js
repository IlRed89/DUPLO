/**
 * @file renderer.js
 * @description Logica UI di DUPLO (Renderer Process, nessun modulo Node diretto).
 *
 * Tutto l'I/O disco passa da `window.duploAPI` (preload + IPC).
 * I moduli UMD (`DuploFormatBytes`, `DuploAdvancedFilters`, …) arrivano
 * come `<script>` prima di questo file.
 *
 * Contratto drag & drop (non modificare):
 * - path nativi da `consumeDroppedPaths` (preload, File vivo);
 * - fallback `getPathForFile` sul File HTML5;
 * - validazione cartella con `validateAndAddFolder`;
 * - `preventDefault` senza `stopPropagation` sul dragover;
 * - overlay con `pointer-events: none` e contatore anti-flicker.
 */

'use strict';

/**
 * Stato applicativo dell'interfaccia. Non è un store persistente:
 * un reset o una nuova scansione lo azzera in RAM.
 * @type {{
 *   selectedFolders: string[],
 *   isScanning: boolean,
 *   duplicateGroups: Array<Object>,
 *   totalFilesScanned: number,
 *   pendingModalAction: (function(): void)|null
 * }}
 */
const state = {
  selectedFolders: [],
  isScanning: false,
  duplicateGroups: [],
  totalFilesScanned: 0,
  pendingModalAction: null,
  selectedPaths: {},
  collapsedReasons: {}
};

const LANG_STORAGE_KEY = 'duplo.lang';
const THEME_STORAGE_KEY = 'duplo.theme';
const MATCH_REASON_ORDER = ['hash', 'size', 'name', 'fuzzy', 'extension', 'date'];

function t(key, vars) {
  try {
    if (window.DuploI18n && typeof window.DuploI18n.t === 'function') {
      return window.DuploI18n.t(key, vars);
    }
  } catch (_err) {}
  return String(key || '');
}
