const test = require('node:test');
const assert = require('node:assert/strict');
const { unpackAsarPath } = require('./ffmpegPaths');

test('unpackAsarPath riscrive app.asar in app.asar.unpacked', () => {
  assert.equal(
    unpackAsarPath('/app/resources/app.asar/node_modules/ffmpeg-static/ffmpeg'),
    '/app/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg'
  );
  assert.equal(unpackAsarPath('/already/unpacked/ffmpeg'), '/already/unpacked/ffmpeg');
  assert.equal(unpackAsarPath(''), '');
});
