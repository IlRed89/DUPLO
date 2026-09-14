/**
 * @file readme.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveReadmePath, loadReadme, readmeCandidates } = require('./readme');
const { markdownToHtml } = require('./renderer/markdown');

test('README.md del progetto è trovato e contiene le sezioni del manuale', () => {
  const loaded = loadReadme();
  assert.ok(loaded.path.endsWith('README.md'));
  assert.match(loaded.content, /# DupFinder/);
  assert.match(loaded.content, /## Avvio/);
  assert.match(loaded.content, /## Flusso consigliato/);
  assert.match(loaded.content, /Pulizia Rapida/);
  assert.match(loaded.content, /## Domande frequenti/);
  assert.match(loaded.content, /Ricerca Avanzata/);
  assert.match(loaded.content, /Categoria file/);
  assert.match(loaded.content, /win\.zip|ia32/);
  assert.ok(loaded.content.length > 4000, 'il manuale deve essere dettagliato');
});

test('resolveReadmePath preferisce extraResources quando il file esiste', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dupfinder-readme-'));
  const packaged = path.join(tmp, 'README.md');
  fs.writeFileSync(packaged, '# Pacchetto\n');
  const found = resolveReadmePath({ resourcesPath: tmp, packaged: true });
  assert.equal(found, packaged);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('readmeCandidates elenca resources, appPath e cartella del progetto', () => {
  const list = readmeCandidates({ resourcesPath: '/res', appPath: '/app' });
  assert.equal(list[0], path.join('/res', 'README.md'));
  assert.equal(list[1], path.join('/app', 'README.md'));
  assert.ok(list[2].endsWith('README.md'));
});

test('markdownToHtml rende titoli, liste, tabelle, codice e grassetto', () => {
  const html = markdownToHtml([
    '# Titolo',
    '',
    'Testo con **grassetto** e `codice`.',
    '',
    '- uno',
    '- due',
    '',
    '1. primo',
    '',
    '| A | B |',
    '| --- | --- |',
    '| x | y |',
    '',
    '```',
    'npm start',
    '```',
    '',
    '[sito](https://example.com)'
  ].join('\n'));

  assert.match(html, /<h1 id="titolo">Titolo<\/h1>/);
  assert.match(html, /<strong>grassetto<\/strong>/);
  assert.match(html, /<code>codice<\/code>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<table>/);
  assert.match(html, /<th>A<\/th>/);
  assert.match(html, /<td>x<\/td>/);
  assert.doesNotMatch(html, />---</);
  assert.match(html, /<pre><code>npm start<\/code><\/pre>/);
  assert.match(html, /href="https:\/\/example.com"/);
  const withToc = markdownToHtml('## Avvio\n\n1. [Avvio](#avvio)\n');
  assert.match(withToc, /<h2 id="avvio">Avvio<\/h2>/);
  assert.match(withToc, /<a href="#avvio">Avvio<\/a>/);
});
