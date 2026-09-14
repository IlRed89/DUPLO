const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseExtensionList,
  sizeToBytes,
  dateInputToMs,
  normalizeDateRange,
  resolveIncludeExtensions,
  KB,
  MB
} = require('./advancedFilters');

test('parseExtensionList accetta virgole, spazi e punto opzionale', () => {
  assert.deepEqual(parseExtensionList('.txt, csv;PDF'), ['.txt', '.csv', '.pdf']);
  assert.deepEqual(parseExtensionList(''), []);
  assert.deepEqual(parseExtensionList(null), []);
  assert.deepEqual(parseExtensionList('.txt, .txt'), ['.txt']);
});

test('sizeToBytes converte KB e MB; valori vuoti = 0', () => {
  assert.equal(sizeToBytes(2, 'kb'), 2 * KB);
  assert.equal(sizeToBytes('1.5', 'mb'), Math.round(1.5 * MB));
  assert.equal(sizeToBytes('', 'kb'), 0);
  assert.equal(sizeToBytes(-3, 'kb'), 0);
});

test('dateInputToMs usa inizio e fine giornata locale', () => {
  const start = dateInputToMs('2026-03-15', false);
  const end = dateInputToMs('2026-03-15', true);
  assert.ok(start > 0);
  assert.ok(end > start);
  assert.equal(new Date(start).getHours(), 0);
  assert.equal(new Date(end).getHours(), 23);
  assert.equal(dateInputToMs('non-una-data', false), 0);
});

test('normalizeDateRange scambia gli estremi invertiti', () => {
  const a = dateInputToMs('2026-04-10', false);
  const b = dateInputToMs('2026-04-01', true);
  const range = normalizeDateRange(a, b);
  assert.equal(range.swapped, true);
  assert.ok(range.modifiedAfterMs < range.modifiedBeforeMs);
});

test('resolveIncludeExtensions: il formato esatto batte la categoria', () => {
  const custom = resolveIncludeExtensions(['.csv'], ['.jpg', '.png']);
  assert.equal(custom.usedCustom, true);
  assert.deepEqual(custom.includeExtensions, ['.csv']);
  const category = resolveIncludeExtensions([], ['.jpg']);
  assert.equal(category.usedCustom, false);
  assert.deepEqual(category.includeExtensions, ['.jpg']);
});
