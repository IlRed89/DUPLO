/**
 * @file renderer.js
 * @description Logica del Renderer Process di DUPLO.
 * Gestisce l'interazione con l'utente (GUI moderna ed user-friendly), l'ascolto degli eventi IPC,
 * l'aggiornamento in tempo reale della progress bar e delle statistiche, e la manipolazione dei risultati.
 * 
 * Ogni interazione viene puntualmente tracciata inviando log persistenti al Main Process.
 */

// Stato applicativo dell'interfaccia
const state = {
  selectedFolders: [],
  isScanning: false,
  duplicateGroups: [],
  totalFilesScanned: 0,
  pendingModalAction: null
};

function logToMain(level, message) {
  try {
    if (window.duploAPI && typeof window.duploAPI.logRendererEvent === 'function') {
      window.duploAPI.logRendererEvent(level, message);
    }
  } catch (err) {
    console.error('Errore invio log al main:', err);
  }
}

const dom = {
  btnAddFolder: document.getElementById('btnAddFolder'),
  btnClearFolders: document.getElementById('btnClearFolders'),
  folderListContainer: document.getElementById('folderListContainer'),
  folderCountBadge: document.getElementById('folderCountBadge'),
  appBody: document.querySelector('.app-body'),
  sidebarPanel: document.querySelector('.sidebar-panel'),
  panelSplitter: document.getElementById('panelSplitter'),
  selectLanguage: document.getElementById('selectLanguage'),
  selectFileCategory: document.getElementById('selectFileCategory'),
  categoryHint: document.getElementById('categoryHint'),
  inputCustomExtensions: document.getElementById('inputCustomExtensions'),
  inputModifiedFrom: document.getElementById('inputModifiedFrom'),
  inputModifiedTo: document.getElementById('inputModifiedTo'),
  inputAdvMinSize: document.getElementById('inputAdvMinSize'),
  inputAdvMaxSize: document.getElementById('inputAdvMaxSize'),
  selectSizeUnit: document.getElementById('selectSizeUnit'),
  advancedSearchPanel: document.getElementById('advancedSearchPanel'),
  btnResetApp: document.getElementById('btnResetApp'),
  chkMatchSize: document.getElementById('chkMatchSize'),
  chkMatchHash: document.getElementById('chkMatchHash'),
  chkMatchName: document.getElementById('chkMatchName'),
  chkMatchFuzzyName: document.getElementById('chkMatchFuzzyName'),
  chkMatchExtension: document.getElementById('chkMatchExtension'),
  chkMatchDate: document.getElementById('chkMatchDate'),
  inputMinSize: document.getElementById('inputMinSize'),
  selectHashAlgo: document.getElementById('selectHashAlgo'),
  chkIncludeHidden: document.getElementById('chkIncludeHidden'),
  btnStartScan: document.getElementById('btnStartScan'),
  btnCancelScan: document.getElementById('btnCancelScan'),
  btnShowLogPath: document.getElementById('btnShowLogPath'),
  btnShowGuide: document.getElementById('btnShowGuide'),
  guideOverlay: document.getElementById('guideOverlay'),
  guideContent: document.getElementById('guideContent'),
  btnCloseGuide: document.getElementById('btnCloseGuide'),
  btnOpenReadmeFile: document.getElementById('btnOpenReadmeFile'),
  progressBarSection: document.getElementById('progressBarSection'),
  progressTrack: document.getElementById('progressTrack'),
  progressFillBar: document.getElementById('progressFillBar'),
  progressPhaseText: document.getElementById('progressPhaseText'),
  progressPercentText: document.getElementById('progressPercentText'),
  progressStatusDetail: document.getElementById('progressStatusDetail'),
  statsBanner: document.getElementById('statsBanner'),
  statFilesScanned: document.getElementById('statFilesScanned'),
  statGroupsCount: document.getElementById('statGroupsCount'),
  statDuplicatesCount: document.getElementById('statDuplicatesCount'),
  statWastedSpace: document.getElementById('statWastedSpace'),
  resultsToolbar: document.getElementById('resultsToolbar'),
  resultsScrollContainer: document.getElementById('resultsScrollContainer'),
  resultsList: document.getElementById('resultsList'),
  emptyPlaceholder: document.getElementById('emptyPlaceholder'),
  emptyPlaceholderTitle: document.getElementById('emptyPlaceholderTitle'),
  emptyPlaceholderText: document.getElementById('emptyPlaceholderText'),
  btnExportJSON: document.getElementById('btnExportJSON'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  btnBatchClean: document.getElementById('btnBatchClean'),
  confirmModal: document.getElementById('confirmModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalMessage: document.getElementById('modalMessage'),
  btnModalCancel: document.getElementById('btnModalCancel'),
  btnModalConfirm: document.getElementById('btnModalConfirm'),
  dragOverlay: document.getElementById('drag-overlay')
};

document.addEventListener('DOMContentLoaded', function() {
  logToMain('info', 'Interfaccia Renderer inizializzata con successo.');
  if (dom.btnAddFolder) dom.btnAddFolder.addEventListener('click', onAddFolderClick);
  if (dom.btnClearFolders) dom.btnClearFolders.addEventListener('click', onClearFoldersClick);
  bindCriteriaLogging();
  initSplitter();
  initFolderDropZone();
  bindLanguageAndCategory();
  bindAdvancedSearchLogging();
  if (dom.btnResetApp) dom.btnResetApp.addEventListener('click', resetApp);
  if (dom.btnStartScan) dom.btnStartScan.addEventListener('click', onStartScanClick);
  if (dom.btnCancelScan) dom.btnCancelScan.addEventListener('click', onCancelScanClick);
  if (dom.btnShowLogPath) dom.btnShowLogPath.addEventListener('click', onShowLogPathClick);
  if (dom.btnShowGuide) dom.btnShowGuide.addEventListener('click', onShowGuideClick);
  if (dom.btnCloseGuide) dom.btnCloseGuide.addEventListener('click', closeGuide);
  if (dom.btnOpenReadmeFile) dom.btnOpenReadmeFile.addEventListener('click', onOpenReadmeFileClick);
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && dom.guideOverlay && !dom.guideOverlay.hidden) closeGuide();
  });
  if (dom.btnExportJSON) dom.btnExportJSON.addEventListener('click', function() { onExportReport('json'); });
  if (dom.btnExportCSV) dom.btnExportCSV.addEventListener('click', function() { onExportReport('csv'); });
  if (dom.btnBatchClean) dom.btnBatchClean.addEventListener('click', onBatchCleanClick);
  if (dom.btnModalCancel) dom.btnModalCancel.addEventListener('click', closeModal);
  if (dom.btnModalConfirm) dom.btnModalConfirm.addEventListener('click', confirmModalAction);
  if (window.duploAPI && typeof window.duploAPI.onScanProgress === 'function') {
    window.duploAPI.onScanProgress(handleScanProgress);
  }
  if (window.duploAPI && typeof window.duploAPI.onOpenGuideFromMenu === 'function') {
    window.duploAPI.onOpenGuideFromMenu(function() {
      logToMain('info', 'Guida aperta dalla barra dei menu nativa');
      onShowGuideClick();
    });
  }
});
