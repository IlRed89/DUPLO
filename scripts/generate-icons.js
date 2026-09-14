/**
 * @file generate-icons.js
 * @description Converte il master vettoriale `build/icon.svg` nei formati richiesti
 * da electron-builder:
 *   - icon.png  (512×512, Linux / tray / fallback)
 *   - icon.ico  (Windows, più risoluzioni)
 *   - icon.icns (macOS)
 *
 * Uso:
 *   npm run icons
 *
 * Dipendenze: `png2icons` (già in devDependencies) e, per rasterizzare l'SVG,
 * Google Chrome in headless. Se Chrome non è disponibile, lo script riusa
 * `build/icon.png` già presente e rigenera solo .ico / .icns.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const SVG_PATH = path.join(BUILD_DIR, 'icon.svg');
const PNG_PATH = path.join(BUILD_DIR, 'icon.png');
const ICO_PATH = path.join(BUILD_DIR, 'icon.ico');
const ICNS_PATH = path.join(BUILD_DIR, 'icon.icns');

/**
 * Rasterizza l'SVG solo se GENERATE_ICONS_RASTER=1 (Chrome headless).
 * Di default si riusa build/icon.png già versionato, per non dipendere da Chrome.
 *
 * @returns {boolean}
 */
function rasterizeSvgWithChrome() {
  if (process.env.GENERATE_ICONS_RASTER !== '1') {
    return false;
  }
  const chrome = process.env.CHROME_PATH || 'google-chrome';
  const htmlPath = path.join(BUILD_DIR, '_icon-raster.html');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; width: 512px; height: 512px; background: transparent; overflow: hidden; }
    img { width: 512px; height: 512px; display: block; }
  </style>
</head>
<body><img src="icon.svg" alt=""></body>
</html>`;

  try {
    fs.writeFileSync(htmlPath, html, 'utf8');
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      '--window-size=512,512',
      `--screenshot=${PNG_PATH}`,
      `file://${htmlPath}`
    ], { stdio: 'inherit' });
    return fs.existsSync(PNG_PATH);
  } catch (err) {
    console.warn('[icons] Raster SVG con Chrome non riuscito:', err.message);
    return false;
  } finally {
    try { fs.unlinkSync(htmlPath); } catch { /* ignore */ }
  }
}

/**
 * Punto di ingresso: PNG → ICO + ICNS.
 */
function main() {
  if (!fs.existsSync(SVG_PATH)) {
    throw new Error(`Master SVG mancante: ${SVG_PATH}`);
  }

  if (!rasterizeSvgWithChrome() && !fs.existsSync(PNG_PATH)) {
    throw new Error('Né Chrome né un icon.png esistente: impossibile generare le icone.');
  }

  png2icons.setLogger(console.log);
  const pngBuffer = fs.readFileSync(PNG_PATH);

  // ICO Windows: PNG compresso nelle varie slot (16…256).
  const ico = png2icons.createICO(pngBuffer, png2icons.BICUBIC, 0, true);
  if (!ico) throw new Error('png2icons.createICO ha restituito null');
  fs.writeFileSync(ICO_PATH, ico);
  console.log('[icons] scritto', ICO_PATH, `(${ico.length} byte)`);

  // ICNS macOS: tutte le dimensioni Apple (inclusa @2x).
  const icns = png2icons.createICNS(pngBuffer, png2icons.BICUBIC, 0);
  if (!icns) throw new Error('png2icons.createICNS ha restituito null');
  fs.writeFileSync(ICNS_PATH, icns);
  console.log('[icons] scritto', ICNS_PATH, `(${icns.length} byte)`);
  console.log('[icons] PNG sorgente', PNG_PATH, `(${pngBuffer.length} byte)`);
}

try {
  main();
} catch (err) {
  console.error('[icons] ERRORE:', err.message);
  process.exit(1);
}
