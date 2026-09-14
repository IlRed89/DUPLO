/**
 * @file nativeMenu.test.js
 * @description Verifica la normalizzazione della lingua e la presenza delle
 * etichette italiane/inglesi nel template (senza applicare il menu a Electron).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLanguage, MENU_STRINGS, buildMenuTemplate } = require('./nativeMenu');

test('normalizeLanguage accetta it/en e fa fallback sull\'italiano', () => {
  assert.equal(normalizeLanguage('it'), 'it');
  assert.equal(normalizeLanguage('IT-it'), 'it');
  assert.equal(normalizeLanguage('en-US'), 'en');
  assert.equal(normalizeLanguage('en'), 'en');
  assert.equal(normalizeLanguage('fr'), 'it');
  assert.equal(normalizeLanguage(null), 'it');
});

test('il template italiano usa le voci File/Modifica/Visualizza/Aiuto', () => {
  const labels = buildMenuTemplate('it').map((item) => item.label);
  assert.ok(labels.includes('File'));
  assert.ok(labels.includes('Modifica'));
  assert.ok(labels.includes('Visualizza'));
  assert.ok(labels.includes('Aiuto'));
  assert.equal(MENU_STRINGS.it.fileQuit, 'Esci');
  assert.equal(MENU_STRINGS.it.helpGuide, 'Guida (README)');
});

test('il template inglese usa File/Edit/View/Help', () => {
  const labels = buildMenuTemplate('en').map((item) => item.label);
  assert.ok(labels.includes('Edit'));
  assert.ok(labels.includes('View'));
  assert.ok(labels.includes('Help'));
  assert.equal(MENU_STRINGS.en.fileQuit, 'Quit');
});
