/**
 * @file applyWinIcon.js
 * @description Hook electron-builder `afterPack`.
 * Timbra `build/icon.ico` su DupFinder.exe con `resedit` (PE puro JS).
 *
 * Perché esiste: su Linux `win.signAndEditExecutable` è false (niente Wine
 * per Authenticode), e electron-builder in quel caso SALTA anche rcedit,
 * lasciando l'icona Electron di default. Questo hook ripristina solo l'icona,
 * senza firmare nulla.
 */

const fs = require('fs');
const path = require('path');

const ICO_PATH = path.join(__dirname, '..', 'build', 'icon.ico');

/**
 * @param {string} message
 */
function log(message) {
  console.log(`[applyWinIcon] ${message}`);
}

/**
 * Sostituisce tutti i gruppi icona del PE con quelli del .ico.
 *
 * @param {string} exePath
 * @param {string} icoPath
 */
function stampIcon(exePath, icoPath) {
  // require ritardato: in `npm test` resedit può non servire.
  const ResEdit = require('resedit');
  const binary = fs.readFileSync(exePath);
  const exe = ResEdit.NtExecutable.from(binary, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
  const iconData = iconFile.icons.map((item) => item.data);

  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  if (!groups.length) {
    // Nessun gruppo: ne creiamo uno (id 1, lingua en-US) come fa Electron.
    log(`Nessun IconGroup in "${exePath}", creo id=1 lang=1033`);
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, iconData);
  } else {
    for (let i = 0; i < groups.length; i += 1) {
      const grp = groups[i];
      log(`Sostituisco IconGroup id=${grp.id} lang=${grp.lang}`);
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        res.entries,
        grp.id,
        grp.lang,
        iconData
      );
    }
  }

  res.outputResource(exe);
  const out = Buffer.from(exe.generate());
  fs.writeFileSync(exePath, out);
  log(`Icona scritta su "${exePath}" (${out.length} byte)`);
}

/**
 * Firma `afterPack` di electron-builder.
 * @param {{ appOutDir?: string, electronPlatformName?: string, packager?: { appInfo?: { productFilename?: string } } }} context
 */
async function applyWinIcon(context) {
  try {
    const platform = (context && context.electronPlatformName) || '';
    if (platform !== 'win32' && platform !== 'win') {
      log(`Piattaforma "${platform}": nessuna icona PE da timbrare`);
      return;
    }
    if (!fs.existsSync(ICO_PATH)) {
      console.warn(`[applyWinIcon] MANCANTE ${ICO_PATH}. Metti build/icon.ico prima della build.`);
      return;
    }
    const appOutDir = (context && context.appOutDir) || '';
    const product = (context && context.packager && context.packager.appInfo
      && context.packager.appInfo.productFilename) || 'DupFinder';
    const exePath = path.join(appOutDir, `${product}.exe`);
    if (!fs.existsSync(exePath)) {
      console.warn(`[applyWinIcon] Eseguibile assente: "${exePath}"`);
      return;
    }
    log(`Timbro "${ICO_PATH}" su "${exePath}"`);
    stampIcon(exePath, ICO_PATH);
  } catch (err) {
    console.error(`[applyWinIcon] Errore (la build continua, icona potrebbe restare quella Electron): ${err.message}`);
  }
}

module.exports = applyWinIcon;
module.exports.default = applyWinIcon;
module.exports.stampIcon = stampIcon;
module.exports.ICO_PATH = ICO_PATH;
