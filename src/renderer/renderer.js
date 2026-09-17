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
  /** Percorsi dei file spuntati per la selezione multipla. */
  selectedPaths: {},
  /** Macro-sezioni risultati compresse (firma AND dei criteri → true). */
  collapsedReasons: {}
};
