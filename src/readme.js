/**
 * @file readme.js
 * @description Trova e legge il manuale README.md di DUPLO in sviluppo e nel pacchetto Electron.
 */

const fs = require('fs');
const path = require('path');

/**
 * Elenca i percorsi in cui il README può stare, in ordine di preferenza.
 * Nel pacchetto Electron il file è copiato in extraResources (process.resourcesPath).
 *
 * @param {{ resourcesPath?: string, appPath?: string, packaged?: boolean }} [opts]
 * @returns {string[]}
 */
function readmeCandidates(opts = {}) {
  const candidates = [];
  if (opts.resourcesPath) {
    candidates.push(path.join(opts.resourcesPath, 'README.md'));
  }
  if (opts.appPath) {
    candidates.push(path.join(opts.appPath, 'README.md'));
  }
  candidates.push(path.join(__dirname, '..', 'README.md'));
  return candidates;
}

/**
 * Restituisce il primo percorso README esistente, oppure null.
 *
 * @param {{ resourcesPath?: string, appPath?: string, packaged?: boolean }} [opts]
 * @returns {string|null}
 */
function resolveReadmePath(opts = {}) {
  for (const candidate of readmeCandidates(opts)) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Percorso non accessibile: prova il successivo.
    }
  }
  return null;
}

/**
 * Legge il contenuto UTF-8 del README.
 *
 * @param {{ resourcesPath?: string, appPath?: string, packaged?: boolean }} [opts]
 * @returns {{ path: string, content: string }}
 */
function loadReadme(opts = {}) {
  const readmePath = resolveReadmePath(opts);
  if (!readmePath) {
    throw new Error('README.md non trovato nell\'applicazione');
  }
  return {
    path: readmePath,
    content: fs.readFileSync(readmePath, 'utf8')
  };
}

module.exports = {
  readmeCandidates,
  resolveReadmePath,
  loadReadme
};
