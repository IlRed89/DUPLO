/**
 * @file i18n.test.js
 * @description Parità delle chiavi tra i quattro dizionari e comportamento
 * di `t()` / `normalizeLanguage` (italiano default).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('./i18n');

test('normalizeLanguage accetta it/en/es/fr e fa fallback sull\'italiano', () => {
  assert.equal(i18n.normalizeLanguage('it'), 'it');
  assert.equal(i18n.normalizeLanguage('IT-it'), 'it');
  assert.equal(i18n.normalizeLanguage('en-US'), 'en');
  assert.equal(i18n.normalizeLanguage('es-MX'), 'es');
  assert.equal(i18n.normalizeLanguage('fr-FR'), 'fr');
  assert.equal(i18n.normalizeLanguage('de'), 'it');
  assert.equal(i18n.normalizeLanguage(null), 'it');
});

test('i quattro dizionari espongono le stesse chiavi dell\'italiano', () => {
  const itKeys = i18n.italianKeys();
  assert.ok(itKeys.length > 80, 'il dizionario italiano deve coprire tutta la UI');
  ['en', 'es', 'fr'].forEach((lang) => {
    const diff = i18n.diffKeys(lang);
    assert.deepEqual(diff.missing, [], lang + ' manca di chiavi italiane');
    assert.deepEqual(diff.extra, [], lang + ' ha chiavi extra rispetto all\'italiano');
  });
});

test('t() interpola i placeholder e cade sull\'italiano se manca la chiave', () => {
  i18n.setLanguage('en');
  assert.equal(i18n.t('theme.light'), 'Light');
  assert.equal(i18n.t('results.group', { n: 3 }), 'Group 3');
  i18n.setLanguage('it');
  assert.equal(i18n.t('reason.hash').includes('Hash'), true);
  assert.equal(i18n.t('reason.fuzzy').includes('Fuzzy'), true);
});

test('MATCH_REASON_ORDER copre i criteri di rilevamento', () => {
  assert.deepEqual(i18n.MATCH_REASON_ORDER, ['hash', 'size', 'name', 'fuzzy', 'extension', 'date']);
});

test('toggle dal 2° in poi, reset separati e badge criteri sono tradotti', () => {
  const keys = [
    'results.selectFromSecond',
    'results.deselectFromSecond',
    'results.fileIndex',
    'results.size',
    'stats.size',
    'reason.extension',
    'reason.date',
    'reason.andJoin',
    'reason.applied',
    'scan.resetFilters',
    'scan.resetSearch',
    'modal.renameTitle',
    'modal.ok'
  ];
  ['it', 'en', 'es', 'fr'].forEach((lang) => {
    i18n.setLanguage(lang);
    keys.forEach((key) => {
      const value = i18n.t(key);
      assert.notEqual(value, key, lang + ' manca ' + key);
      assert.ok(value.length > 0, lang + ' ' + key + ' vuota');
    });
    assert.equal(i18n.t('reason.applied').indexOf('AND'), -1, lang + ' reason.applied non deve contenere AND');
    assert.equal(i18n.t('reason.andJoin').indexOf('AND'), -1, lang + ' reason.andJoin non deve contenere AND');
    assert.equal(i18n.t('results.size').toLowerCase().indexOf('spreco'), -1, lang + ' results.size non deve contenere Spreco');
    assert.equal(i18n.t('results.size').toLowerCase().indexOf('wasted'), -1, lang + ' results.size non deve contenere Wasted');
  });
  i18n.setLanguage('it');
  assert.equal(i18n.t('results.selectFromSecond'), 'Seleziona dal 2° in poi');
  assert.equal(i18n.t('results.deselectFromSecond'), 'Deseleziona dal 2° in poi');
  assert.equal(i18n.t('results.fileIndex', { n: 2 }), 'File #2');
  assert.equal(i18n.t('stats.size'), 'Dimensione');
  assert.equal(i18n.t('results.size', { size: '10 MB' }), 'Dimensione: 10 MB');
  assert.equal(i18n.t('reason.extension'), 'Stessa Estensione');
  assert.equal(i18n.t('scan.resetFilters'), 'Azzera Filtri');
  assert.equal(i18n.t('scan.resetSearch'), 'Azzera Ricerca');
  assert.equal(i18n.t('reason.andJoin').trim(), '•');
  i18n.setLanguage('en');
  assert.equal(i18n.t('stats.size'), 'Size');
  i18n.setLanguage('es');
  assert.equal(i18n.t('stats.size'), 'Tamaño');
  i18n.setLanguage('fr');
  assert.equal(i18n.t('stats.size'), 'Taille');
  i18n.setLanguage('it');
});
