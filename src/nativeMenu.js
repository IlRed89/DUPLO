/**
 * @file nativeMenu.js
 * @description Costruisce e applica la barra dei menu nativa di Electron
 * (File / Modifica / Visualizza / Finestra / Aiuto) nella lingua richiesta.
 *
 * Perché un modulo dedicato:
 * - il Renderer non può toccare `Menu` (vive nel Main Process);
 * - quando l'utente cambia lingua, il Main ricostruisce l'intero template
 *   con `Menu.buildFromTemplate()` e lo applica con `Menu.setApplicationMenu()`.
 */

const { logger } = require('./logger');

/**
 * Lingua attualmente applicata alla barra nativa.
 * Serve per evitare ricostruzioni inutili e per i log di diagnostica.
 * @type {'it'|'en'}
 */
let currentMenuLanguage = 'it';

/**
 * Dizionario delle etichette. Solo stringhe visibili: i `role` Electron
 * restano in inglese (undo, copy, quit…) perché sono identificatori interni.
 * @type {Record<'it'|'en', Record<string, string>>}
 */
const MENU_STRINGS = {
  it: {
    appMenu: 'DUPLO',
    file: 'File',
    fileQuit: 'Esci',
    edit: 'Modifica',
    editUndo: 'Annulla',
    editRedo: 'Ripeti',
    editCut: 'Taglia',
    editCopy: 'Copia',
    editPaste: 'Incolla',
    editSelectAll: 'Seleziona tutto',
    view: 'Visualizza',
    viewReload: 'Ricarica',
    viewDevTools: 'Strumenti per sviluppatori',
    viewZoomIn: 'Ingrandisci',
    viewZoomOut: 'Riduci',
    viewZoomReset: 'Zoom predefinito',
    viewFullScreen: 'Schermo intero',
    window: 'Finestra',
    windowMinimize: 'Riduci a icona',
    windowClose: 'Chiudi',
    help: 'Aiuto',
    helpGuide: 'Guida (README)',
    helpLogs: 'Apri cartella dei log',
    helpWebsite: 'Pagina GitHub'
  },
  en: {
    appMenu: 'DUPLO',
    file: 'File',
    fileQuit: 'Quit',
    edit: 'Edit',
    editUndo: 'Undo',
    editRedo: 'Redo',
    editCut: 'Cut',
    editCopy: 'Copy',
    editPaste: 'Paste',
    editSelectAll: 'Select All',
    view: 'View',
    viewReload: 'Reload',
    viewDevTools: 'Toggle Developer Tools',
    viewZoomIn: 'Zoom In',
    viewZoomOut: 'Zoom Out',
    viewZoomReset: 'Actual Size',
    viewFullScreen: 'Toggle Full Screen',
    window: 'Window',
    windowMinimize: 'Minimize',
    windowClose: 'Close',
    help: 'Help',
    helpGuide: 'User Guide (README)',
    helpLogs: 'Open log folder',
    helpWebsite: 'GitHub page'
  }
};

/**
 * Normalizza il codice lingua arrivato dal Renderer.
 * Accettiamo "it", "it-IT", "en", "en-US"; qualsiasi altro valore torna all'italiano
 * (lingua di default dell'applicazione).
 *
 * @param {unknown} lang
 * @returns {'it'|'en'}
 */
function normalizeLanguage(lang) {
  try {
    const raw = String(lang || 'it').trim().toLowerCase();
    const short = raw.split(/[-_]/)[0];
    if (short === 'en') return 'en';
    return 'it';
  } catch (err) {
    logger.warn(`[Menu] Lingua non valida "${lang}": ${err.message}. Uso italiano.`);
    return 'it';
  }
}

/**
 * Costruisce il template Electron per la lingua indicata.
 *
 * @param {'it'|'en'} lang
 * @param {{ openGuide?: function(): void, openLogs?: function(): void }} [actions]
 * @returns {Electron.MenuItemConstructorOptions[]}
 */
function buildMenuTemplate(lang, actions = {}) {
  const t = MENU_STRINGS[lang] || MENU_STRINGS.it;
  const isMac = process.platform === 'darwin';

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [];

  // Su macOS il primo menu è il nome dell'app (convenzione Apple).
  if (isMac) {
    template.push({
      label: t.appMenu,
      submenu: [
        { role: 'about', label: t.appMenu },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: t.fileQuit }
      ]
    });
  }

  template.push({
    label: t.file,
    submenu: [
      isMac
        ? { role: 'close', label: t.windowClose }
        : { role: 'quit', label: t.fileQuit }
    ]
  });

  template.push({
    label: t.edit,
    submenu: [
      { role: 'undo', label: t.editUndo },
      { role: 'redo', label: t.editRedo },
      { type: 'separator' },
      { role: 'cut', label: t.editCut },
      { role: 'copy', label: t.editCopy },
      { role: 'paste', label: t.editPaste },
      { role: 'selectAll', label: t.editSelectAll }
    ]
  });

  template.push({
    label: t.view,
    submenu: [
      { role: 'reload', label: t.viewReload },
      { role: 'toggleDevTools', label: t.viewDevTools },
      { type: 'separator' },
      { role: 'resetZoom', label: t.viewZoomReset },
      { role: 'zoomIn', label: t.viewZoomIn },
      { role: 'zoomOut', label: t.viewZoomOut },
      { type: 'separator' },
      { role: 'togglefullscreen', label: t.viewFullScreen }
    ]
  });

  template.push({
    label: t.window,
    submenu: [
      { role: 'minimize', label: t.windowMinimize },
      { role: 'close', label: t.windowClose }
    ]
  });

  template.push({
    label: t.help,
    submenu: [
      {
        label: t.helpGuide,
        accelerator: 'F1',
        click: () => {
          logger.info(`[Menu] Voce "${t.helpGuide}" selezionata`);
          if (typeof actions.openGuide === 'function') {
            actions.openGuide();
          }
        }
      },
      {
        label: t.helpLogs,
        click: () => {
          logger.info(`[Menu] Voce "${t.helpLogs}" selezionata`);
          if (typeof actions.openLogs === 'function') {
            actions.openLogs();
          }
        }
      },
      { type: 'separator' },
      {
        label: t.helpWebsite,
        click: async () => {
          try {
            logger.info('[Menu] Apertura pagina GitHub nel browser di sistema');
            const { shell } = require('electron');
            await shell.openExternal('https://github.com/IlRed89/DUPLO');
          } catch (err) {
            logger.error(`[Menu] Impossibile aprire GitHub: ${err.message}`);
          }
        }
      }
    ]
  });

  return template;
}

/**
 * Ricostruisce e applica la barra dei menu nativa nella lingua richiesta.
 * Chiamata all'avvio (italiano) e ad ogni evento IPC `language-changed`.
 *
 * @param {unknown} lang - Codice lingua dal Renderer (es. "it", "en-US")
 * @param {{ openGuide?: function(): void, openLogs?: function(): void }} [actions]
 * @returns {'it'|'en'} Lingua effettivamente applicata
 */
function createNativeMenu(lang, actions = {}) {
  const normalized = normalizeLanguage(lang);
  logger.info(`[Menu] Ricostruzione menu nativo in lingua "${normalized}" (richiesta: "${lang}")`);

  try {
    const { Menu } = require('electron');
    const template = buildMenuTemplate(normalized, actions);
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    currentMenuLanguage = normalized;
    logger.info(`[Menu] Menu nativo applicato (${normalized}). Voce File = "${MENU_STRINGS[normalized].file}"`);
    return normalized;
  } catch (err) {
    logger.error(`[Menu] Fallita costruzione menu per "${normalized}": ${err.message}`);
    throw err;
  }
}

/**
 * @returns {'it'|'en'}
 */
function getCurrentMenuLanguage() {
  return currentMenuLanguage;
}

module.exports = {
  MENU_STRINGS,
  normalizeLanguage,
  buildMenuTemplate,
  createNativeMenu,
  getCurrentMenuLanguage
};
