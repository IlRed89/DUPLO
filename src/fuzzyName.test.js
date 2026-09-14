const test = require('node:test');
const assert = require('node:assert/strict');
const {
  nameSimilarity,
  clusterByFuzzyName,
  FUZZY_NAME_THRESHOLD,
  fileStem
} = require('./fuzzyName');

test('Canzone.mp3 e Canzone (Remix).mp3 superano la soglia 80%', () => {
  const score = nameSimilarity('Canzone.mp3', 'Canzone (Remix).mp3');
  assert.ok(score >= FUZZY_NAME_THRESHOLD, `score=${score}`);
  assert.equal(fileStem('Canzone.mp3'), 'canzone');
});

test('foto.jpg e documento.pdf non sono simili', () => {
  const score = nameSimilarity('foto.jpg', 'documento.pdf');
  assert.ok(score < FUZZY_NAME_THRESHOLD, `score=${score}`);
});

test('clusterByFuzzyName unisce i remix e lascia fuori i nomi lontani', () => {
  const files = [
    { name: 'Canzone.mp3' },
    { name: 'Canzone (Remix).mp3' },
    { name: 'Relazione-finale.pdf' }
  ];
  const clusters = clusterByFuzzyName(files);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].length, 2);
  assert.ok(clusters[0].every((f) => /Canzone/i.test(f.name)));
});
