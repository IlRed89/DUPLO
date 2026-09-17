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
  assert.equal(i18n.t('results.group', { n: 3 }), 'Group #3');
  i18n.setLanguage('it');
  assert.equal(i18n.t('reason.hash').includes('Hash'), true);
  assert.equal(i18n.t('reason.fuzzy').includes('Fuzzy'), true);
});

test('MATCH_REASON_ORDER copre i quattro criteri di rilevamento', () => {
  assert.deepEqual(i18n.MATCH_REASON_ORDER, ['hash', 'size', 'name', 'fuzzy']);
});
