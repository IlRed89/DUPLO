/**
 * @file fuzzyName.js
 * @description Fase 7.0 — somiglianza tra nomi file (Levenshtein + Dice + stem normalizzato).
 * Soglia predefinita 0.80: "Canzone.mp3" e "Canzone (Remix).mp3" finiscono nello stesso gruppo
 * perché, togliendo estensione e testo tra parentesi, lo stem coincide.
 *
 * Nessuna dipendenza esterna: l'algoritmo è testabile con Node senza Electron.
 */

const path = require('path');
const { logger } = require('./logger');

/** Soglia richiesta dalla specifica Fase 7.0 (80%). */
const FUZZY_NAME_THRESHOLD = 0.8;

/**
 * Toglie l'estensione e normalizza il nome per il confronto.
 * Esempio: "Canzone (Remix).MP3" → "canzone (remix)"
 *
 * @param {string} fileName
 * @returns {string}
 */
function fileStem(fileName) {
  const base = path.basename(String(fileName || ''));
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  return stem.toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Variante dello stem senza contenuto tra parentesi/quadre (remix, "1", copia).
 * @param {string} stem
 * @returns {string}
 */
function stemWithoutDecorators(stem) {
  return String(stem || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Distanza di Levenshtein (programmazione dinamica, O(n*m)).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const n = s.length;
  const m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const prev = new Array(m + 1);
  const curr = new Array(m + 1);
  for (let j = 0; j <= m; j += 1) {
    prev[j] = j;
  }
  for (let i = 1; i <= n; i += 1) {
    curr[0] = i;
    const si = s.charCodeAt(i - 1);
    for (let j = 1; j <= m; j += 1) {
      const cost = si === t.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    for (let j = 0; j <= m; j += 1) {
      prev[j] = curr[j];
    }
  }
  return prev[m];
}

/**
 * Similarità Levenshtein normalizzata in [0, 1]: 1 - dist / max(len).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinSimilarity(a, b) {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Coefficiente di Dice sui bigrammi (stesso approccio di `string-similarity`).
 * @param {string} first
 * @param {string} second
 * @returns {number}
 */
function diceCoefficient(first, second) {
  const a = String(first || '').replace(/\s+/g, '');
  const b = String(second || '').replace(/\s+/g, '');
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const map = Object.create(null);
  for (let i = 0; i < a.length - 1; i += 1) {
    const bigram = a.slice(i, i + 2);
    map[bigram] = (map[bigram] || 0) + 1;
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const bigram = b.slice(i, i + 2);
    if (map[bigram] > 0) {
      map[bigram] -= 1;
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.length + b.length - 2);
}

/**
 * Punteggio finale: il massimo tra Dice, Levenshtein e confronto degli stem "puliti".
 * Così "Canzone.mp3" e "Canzone (Remix).mp3" superano 0.80.
 *
 * @param {string} nameA
 * @param {string} nameB
 * @returns {number}
 */
function nameSimilarity(nameA, nameB) {
  try {
    const stemA = fileStem(nameA);
    const stemB = fileStem(nameB);
    if (!stemA || !stemB) {
      return 0;
    }
    if (stemA === stemB) {
      return 1;
    }
    const cleanA = stemWithoutDecorators(stemA);
    const cleanB = stemWithoutDecorators(stemB);
    const scores = [
      diceCoefficient(stemA, stemB),
      levenshteinSimilarity(stemA, stemB),
      diceCoefficient(cleanA, cleanB),
      levenshteinSimilarity(cleanA, cleanB)
    ];
    // Prefisso: il nome più corto è l'inizio del più lungo (es. "foto" / "foto copia").
    const shorter = cleanA.length <= cleanB.length ? cleanA : cleanB;
    const longer = cleanA.length <= cleanB.length ? cleanB : cleanA;
    if (shorter.length >= 4 && longer.startsWith(shorter)) {
      scores.push(0.92);
    }
    let best = 0;
    for (let i = 0; i < scores.length; i += 1) {
      if (scores[i] > best) {
        best = scores[i];
      }
    }
    return best;
  } catch (err) {
    logger.warn(`[Fuzzy] nameSimilarity fallita: ${err.message}`);
    return 0;
  }
}

/**
 * Union-Find minimale per raggruppare indici connessi.
 * @param {number} n
 * @returns {{ find: function(number): number, union: function(number, number): void }}
 */
function createUnionFind(n) {
  const parent = new Array(n);
  for (let i = 0; i < n; i += 1) {
    parent[i] = i;
  }
  const find = (i) => {
    if (parent[i] !== i) {
      parent[i] = find(parent[i]);
    }
    return parent[i];
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[rb] = ra;
    }
  };
  return { find, union };
}

/**
 * Spezza un elenco di file in sottogruppi con nome simile ≥ soglia.
 * Complessità O(n²) sul bucket (i bucket sono già ristretti da size/ext/data).
 *
 * @param {Array<{name: string, path?: string}>} files
 * @param {number} [threshold]
 * @returns {Array<Array<object>>} cluster con almeno 2 file
 */
function clusterByFuzzyName(files, threshold) {
  const list = Array.isArray(files) ? files : [];
  const cut = typeof threshold === 'number' ? threshold : FUZZY_NAME_THRESHOLD;
  if (list.length < 2) {
    return [];
  }
  const uf = createUnionFind(list.length);
  let pairCount = 0;
  try {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const score = nameSimilarity(list[i].name, list[j].name);
        if (score + 1e-9 >= cut) {
          uf.union(i, j);
          pairCount += 1;
          logger.debug(`[Fuzzy] "${list[i].name}" ≈ "${list[j].name}" (${score.toFixed(3)})`);
        }
      }
    }
  } catch (err) {
    logger.error(`[Fuzzy] clusterByFuzzyName interrotto: ${err.message}`);
    return list.length > 1 ? [list] : [];
  }
  const groups = new Map();
  for (let i = 0; i < list.length; i += 1) {
    const root = uf.find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root).push(list[i]);
  }
  const clusters = [];
  for (const [, members] of groups) {
    if (members.length > 1) {
      clusters.push(members);
    }
  }
  logger.info(`[Fuzzy] ${list.length} file → ${clusters.length} cluster (coppie ≥${cut}: ${pairCount})`);
  return clusters;
}

module.exports = {
  FUZZY_NAME_THRESHOLD,
  fileStem,
  stemWithoutDecorators,
  levenshtein,
  levenshteinSimilarity,
  diceCoefficient,
  nameSimilarity,
  clusterByFuzzyName
};
