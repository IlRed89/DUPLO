const test = require('node:test');
const assert = require('node:assert/strict');
const { FILE_CATEGORIES, getCategoryExtensions, formatCategoryHint } = require('./fileCategories');
const { clampSidebarWidth, MIN_SIDEBAR_PX } = require('./renderer/splitterMath');

test('categorie hardcoded espongono immagini/audio/documenti/video/tutti', () => {
  assert.deepEqual(getCategoryExtensions('images'), ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']);
  assert.deepEqual(getCategoryExtensions('audio'), ['.mp3', '.wav', '.flac', '.aac']);
  assert.deepEqual(getCategoryExtensions('documents'), ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt']);
  assert.deepEqual(getCategoryExtensions('video'), ['.mp4', '.mkv', '.avi', '.mov']);
  assert.deepEqual(getCategoryExtensions('all'), []);
  assert.deepEqual(getCategoryExtensions('sconosciuta'), []);
  assert.ok(formatCategoryHint('images').includes('.png'));
  assert.equal(Object.keys(FILE_CATEGORIES).length, 5);
});

test('clampSidebarWidth rispetta minimi sidebar e area risultati', () => {
  assert.equal(clampSidebarWidth(380, 40, 1000), 420);
  assert.equal(clampSidebarWidth(380, -500, 1000), MIN_SIDEBAR_PX);
  // container 700, min main 320 → max sidebar 380
  assert.equal(clampSidebarWidth(380, 400, 700), 380);
});
