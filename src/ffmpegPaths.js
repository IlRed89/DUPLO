/**
 * @file ffmpegPaths.js
 * @description Risolve i binari FFmpeg / FFprobe impacchettati con l'app.
 *
 * Ordine di ricerca (primo path esistente vince):
 * 1. extraResources: `<resources>/ffmpeg/ffmpeg[.exe]` (produzione, extraResources)
 * 2. `ffmpeg-static` / `ffprobe-static` con sostituzione `app.asar` → `app.asar.unpacked`
 * 3. path raw esportato dal pacchetto npm (sviluppo: node_modules)
 *
 * L'utente NON deve installare FFmpeg sul sistema: i binari viaggiano nello zip.
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

/**
 * Sostituisce il segmento app.asar con app.asar.unpacked: i binari non si eseguono da dentro l'ASAR.
 * @param {unknown} raw
 * @returns {string}
 */
function unpackAsarPath(raw) {
  if (typeof raw !== 'string' || !raw) {
    return '';
  }
  return raw.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
}

/**
 * Restituisce il primo path che esiste sul disco.
 * @param {string[]} candidates
 * @returns {string}
 */
function firstExisting(candidates) {
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate) {
      continue;
    }
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (err) {
      logger.warn(`[FFmpeg] existsSync fallito su "${candidate}": ${err.message}`);
    }
  }
  return '';
}

/**
 * Nome file del binario in base alla piattaforma.
 * @param {'ffmpeg'|'ffprobe'} tool
 * @returns {string}
 */
function binaryFileName(tool) {
  const exe = process.platform === 'win32' ? '.exe' : '';
  return tool + exe;
}

/**
 * Elenco candidati per ffmpeg o ffprobe.
 *
 * @param {'ffmpeg'|'ffprobe'} tool
 * @param {{ resourcesPath?: string, appPath?: string, packaged?: boolean }} [opts]
 * @returns {string[]}
 */
function collectCandidates(tool, opts) {
  const options = opts || {};
  const resourcesPath = options.resourcesPath || process.resourcesPath || '';
  const appPath = options.appPath || '';
  const fileName = binaryFileName(tool);
  const list = [];

  // 1) extraResources (vedi package.json build.extraResources + beforePack)
  if (resourcesPath) {
    list.push(path.join(resourcesPath, 'ffmpeg', fileName));
    list.push(path.join(resourcesPath, 'ffmpeg', tool));
    list.push(path.join(resourcesPath, 'ffmpeg', `${tool}.exe`));
    // ffprobe-static copia l'albero bin/<platform>/<arch>/
    const plat = process.platform === 'win32' ? 'win32' : process.platform;
    list.push(path.join(resourcesPath, 'ffprobe-bin', plat, process.arch, fileName));
    list.push(path.join(resourcesPath, 'ffprobe-bin', plat, 'x64', fileName));
    list.push(path.join(resourcesPath, 'ffprobe-bin', plat, 'ia32', fileName));
    list.push(path.join(resourcesPath, 'ffprobe-bin', 'win32', process.arch, fileName));
  }

  // 2) pacchetti npm (dev + asarUnpack)
  try {
    if (tool === 'ffmpeg') {
      const packed = require('ffmpeg-static');
      if (typeof packed === 'string') {
        list.push(unpackAsarPath(packed));
        list.push(packed);
      }
    } else {
      const packed = require('ffprobe-static');
      const raw = packed && packed.path ? packed.path : '';
      if (raw) {
        list.push(unpackAsarPath(raw));
        list.push(raw);
      }
    }
  } catch (err) {
    logger.warn(`[FFmpeg] require(${tool}-static) non disponibile: ${err.message}`);
  }

  // 3) fallback accanto all'app (dev: /workspace/node_modules/...)
  if (appPath) {
    const pkg = tool === 'ffmpeg' ? 'ffmpeg-static' : 'ffprobe-static';
    list.push(path.join(appPath, 'node_modules', pkg, fileName));
  }

  return list;
}

/**
 * @param {{ resourcesPath?: string, appPath?: string, packaged?: boolean }} [opts]
 * @returns {{ ffmpeg: string, ffprobe: string }}
 */
function resolveFfmpegBinaries(opts) {
  const ffmpeg = firstExisting(collectCandidates('ffmpeg', opts));
  const ffprobe = firstExisting(collectCandidates('ffprobe', opts));
  return { ffmpeg, ffprobe };
}

/**
 * Scrive nel log persistente i path risolti (o l'assenza, senza far crashare l'app).
 * @param {{ resourcesPath?: string, appPath?: string, packaged?: boolean }} [opts]
 * @returns {{ ffmpeg: string, ffprobe: string }}
 */
function logFfmpegAvailability(opts) {
  try {
    const resolved = resolveFfmpegBinaries(opts);
    if (resolved.ffmpeg) {
      logger.info(`[FFmpeg] Binario ffmpeg: "${resolved.ffmpeg}"`);
    } else {
      logger.warn('[FFmpeg] Binario ffmpeg NON trovato (l\'hash dei file continua a funzionare senza di esso)');
    }
    if (resolved.ffprobe) {
      logger.info(`[FFmpeg] Binario ffprobe: "${resolved.ffprobe}"`);
    } else {
      logger.warn('[FFmpeg] Binario ffprobe NON trovato');
    }
    applyFfmpegEnv(resolved);
    return resolved;
  } catch (err) {
    logger.error(`[FFmpeg] Risoluzione binari fallita: ${err.message}`);
    return { ffmpeg: '', ffprobe: '' };
  }
}

/**
 * Espone i path a librerie che cercano FFMPEG_PATH / FFPROBE_PATH
 * (fluent-ffmpeg, spawn interni). Non lancia se i path sono vuoti.
 *
 * @param {{ ffmpeg?: string, ffprobe?: string }} resolved
 */
function applyFfmpegEnv(resolved) {
  try {
    const bins = resolved || {};
    if (bins.ffmpeg) {
      process.env.FFMPEG_PATH = bins.ffmpeg;
      process.env.FFMPEG_BIN = bins.ffmpeg;
      logger.info(`[FFmpeg] process.env.FFMPEG_PATH = "${bins.ffmpeg}"`);
    }
    if (bins.ffprobe) {
      process.env.FFPROBE_PATH = bins.ffprobe;
      process.env.FFPROBE_BIN = bins.ffprobe;
      logger.info(`[FFmpeg] process.env.FFPROBE_PATH = "${bins.ffprobe}"`);
    }
  } catch (err) {
    logger.error(`[FFmpeg] Impossibile impostare le variabili d'ambiente: ${err.message}`);
  }
}

module.exports = {
  unpackAsarPath,
  collectCandidates,
  resolveFfmpegBinaries,
  logFfmpegAvailability,
  applyFfmpegEnv
};
