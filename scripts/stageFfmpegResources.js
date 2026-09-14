/**
 * @file stageFfmpegResources.js
 * @description Hook electron-builder `beforePack`.
 * Copia o scarica ffmpeg/ffprobe nella cartella extraResources `build/ffmpeg-staged`
 * così l'utente non deve installare FFmpeg sul sistema.
 *
 * In sviluppo i path arrivano da `ffmpeg-static` / `ffprobe-static`.
 * In produzione (ASAR) i binari stanno in `process.resourcesPath/ffmpeg`
 * oppure in `app.asar.unpacked/node_modules/...`.
 *
 * Cross-compile Linux → Windows: il postinstall di ffmpeg-static scarica
 * il binario HOST. Questo hook scarica ffmpeg.exe win32 per l'arch target.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const STAGED_DIR = path.join(__dirname, '..', 'build', 'ffmpeg-staged');
const FFMPEG_RELEASES = ['b6.0', 'b5.2'];

/**
 * @param {string} message
 */
function log(message) {
  console.log(`[stageFfmpeg] ${message}`);
}

/**
 * @param {string} dir
 */
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    throw new Error(`Impossibile creare "${dir}": ${err.message}`);
  }
}

/**
 * @param {string} src
 * @param {string} dest
 * @returns {boolean}
 */
function copyIfExists(src, dest) {
  try {
    if (!src || !fs.existsSync(src)) {
      return false;
    }
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    log(`Copia "${src}" → "${dest}"`);
    return true;
  } catch (err) {
    console.warn(`[stageFfmpeg] Copia fallita ${src}: ${err.message}`);
    return false;
  }
}

/**
 * Scarica un .gz e lo decomprime sul path di destinazione.
 * @param {string} url
 * @param {string} dest
 * @returns {Promise<void>}
 */
function downloadGunzip(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (currentUrl, redirectsLeft) => {
      https.get(currentUrl, { headers: { 'User-Agent': 'DupFinder-stageFfmpeg' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          request(res.headers.location, redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} per ${currentUrl}`));
          return;
        }
        ensureDir(path.dirname(dest));
        const out = fs.createWriteStream(dest);
        res.pipe(zlib.createGunzip()).pipe(out);
        out.on('finish', () => {
          try {
            fs.chmodSync(dest, 0o755);
          } catch (err) {
            console.warn(`[stageFfmpeg] chmod non applicato: ${err.message}`);
          }
          resolve();
        });
        out.on('error', reject);
      }).on('error', reject);
    };
    request(url, 5);
  });
}

/**
 * @param {string} arch electron-builder (x64 | ia32 | arm64)
 * @returns {string}
 */
function mapWinArch(arch) {
  // electron-builder passa Arch come enum numerico (ia32=0, x64=1, arm64=3).
  if (arch === 0 || arch === 'ia32') {
    return 'ia32';
  }
  if (arch === 3 || arch === 'arm64') {
    return 'arm64';
  }
  return 'x64';
}

/**
 * Scarica ffmpeg.exe Windows da oste eugeneware/ffmpeg-static (stessa fonte del pacchetto npm).
 * @param {string} dest
 * @param {string} arch
 * @returns {Promise<boolean>}
 */
async function downloadWinFfmpeg(dest, arch) {
  const mapped = mapWinArch(arch);
  for (let i = 0; i < FFMPEG_RELEASES.length; i += 1) {
    const tag = FFMPEG_RELEASES[i];
    const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${tag}/ffmpeg-win32-${mapped}.gz`;
    try {
      log(`Download ${url}`);
      await downloadGunzip(url, dest);
      log(`ffmpeg.exe Windows (${mapped}) pronto in ${dest}`);
      return true;
    } catch (err) {
      console.warn(`[stageFfmpeg] Tentativo ${tag} fallito: ${err.message}`);
    }
  }
  return false;
}

/**
 * Path del binario host esposto da ffmpeg-static / ffprobe-static.
 * @param {'ffmpeg'|'ffprobe'} tool
 * @returns {string}
 */
function hostPackageBinary(tool) {
  try {
    if (tool === 'ffmpeg') {
      const packed = require('ffmpeg-static');
      return typeof packed === 'string' ? packed : '';
    }
    const packed = require('ffprobe-static');
    return packed && packed.path ? packed.path : '';
  } catch (err) {
    console.warn(`[stageFfmpeg] require(${tool}-static): ${err.message}`);
    return '';
  }
}

/**
 * Firma richiesta da electron-builder (`beforePack`).
 * @param {{ electronPlatformName?: string, arch?: string }} context
 */
async function stageFfmpegResources(context) {
  try {
    ensureDir(STAGED_DIR);
    const platform = (context && context.electronPlatformName) || process.platform;
    // Arch.ia32 vale 0: non usare `||` altrimenti si cade su process.arch (x64 in CI Linux).
    const arch = context && Object.prototype.hasOwnProperty.call(context, 'arch')
      ? context.arch
      : process.arch;
    const isWin = platform === 'win32' || platform === 'win';
    const ffmpegName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
    const ffprobeName = isWin ? 'ffprobe.exe' : 'ffprobe';
    const destFfmpeg = path.join(STAGED_DIR, ffmpegName);
    const destFfprobe = path.join(STAGED_DIR, ffprobeName);

    log(`Target ${platform}/${arch} → ${STAGED_DIR}`);

    let ffmpegOk = false;
    if (isWin && process.platform !== 'win32') {
      ffmpegOk = await downloadWinFfmpeg(destFfmpeg, arch);
    }
    if (!ffmpegOk) {
      ffmpegOk = copyIfExists(hostPackageBinary('ffmpeg'), destFfmpeg);
    }

    const probeFromPkg = path.join(
      __dirname,
      '..',
      'node_modules',
      'ffprobe-static',
      'bin',
      isWin ? 'win32' : process.platform,
      mapWinArch(isWin ? arch : process.arch),
      ffprobeName
    );
    let probeOk = copyIfExists(probeFromPkg, destFfprobe);
    if (!probeOk) {
      probeOk = copyIfExists(hostPackageBinary('ffprobe'), destFfprobe);
    }

    if (!ffmpegOk) {
      console.warn('[stageFfmpeg] ffmpeg non staged: l\'hash dei file continua a funzionare');
    }
    if (!probeOk) {
      console.warn('[stageFfmpeg] ffprobe non staged');
    }
  } catch (err) {
    console.error(`[stageFfmpeg] Hook beforePack fallito (non blocco la build): ${err.message}`);
  }
}

module.exports = stageFfmpegResources;
module.exports.default = stageFfmpegResources;
module.exports.STAGED_DIR = STAGED_DIR;
