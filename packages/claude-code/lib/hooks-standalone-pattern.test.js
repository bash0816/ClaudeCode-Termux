const test = require('node:test');
const assert = require('assert/strict');
const { countQleMatches, applyQlePatch } = require('./hooks-standalone-pattern.js');
const fs = require('fs');
const path = require('path');

test('countQleMatches finds pattern once in simple example', () => {
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  const count = countQleMatches(source);
  assert.equal(count, 1);
});

test('applyQlePatch replaces uu() with (!0)', () => {
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  const expected = 'var qle=(e,o,r)=>(!0)?ar(o,r(),e):{module:o,folder:e};';
  const result = applyQlePatch(source);
  assert.equal(result, expected);
});

test('applyQlePatch is idempotent', () => {
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  const patched = applyQlePatch(source);
  const repatch = applyQlePatch(patched);
  assert.equal(repatch, patched);
  assert.equal(countQleMatches(patched), 0);
});

test('countQleMatches finds pattern with different minify names', () => {
  const source = 'var vCe=(a,b,c)=>H1()?zz(b,c(),a):{module:b,folder:a};';
  const count = countQleMatches(source);
  assert.equal(count, 1);
});

test('applyQlePatch works with different minify names', () => {
  const source = 'var vCe=(a,b,c)=>H1()?zz(b,c(),a):{module:b,folder:a};';
  const expected = 'var vCe=(a,b,c)=>(!0)?zz(b,c(),a):{module:b,folder:a};';
  const result = applyQlePatch(source);
  assert.equal(result, expected);
});

test('countQleMatches returns 0 for mismatched pattern (wrong field order)', () => {
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:e,folder:o};'; // swapped
  const count = countQleMatches(source);
  assert.equal(count, 0);
});

test('countQleMatches returns 0 for import.meta.dirname only', () => {
  const source = 'import.meta.dirname';
  const count = countQleMatches(source);
  assert.equal(count, 0);
});

test('countQleMatches returns 0 for unrelated arrow function', () => {
  const source = 'const f = (a, b, c) => someFunc() ? a : b;';
  const count = countQleMatches(source);
  assert.equal(count, 0);
});

test('countQleMatches finds multiple patterns', () => {
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e}; var qle2=(a,b,c)=>uu()?ar(b,c(),a):{module:b,folder:a};';
  const count = countQleMatches(source);
  assert.equal(count, 2);
});

test('real chunk from 2.1.278 (if exists)', () => {
  const versions = [
    path.join(process.env.HOME || '.', '.claude-termux-native-package', 'versions', '2.1.278', 'launcher-workdir'),
  ];
  const testRun = versions.some((vdir) => {
    const chunks = [];
    if (fs.existsSync(vdir)) {
      const esmDir = fs.readdirSync(vdir).find((d) => d.startsWith('esm.'));
      if (esmDir) {
        const chunkDir = path.join(vdir, esmDir);
        const chunkFile = fs.readdirSync(chunkDir).find((f) => f.match(/^chunk-7nckpqfv\.js$/));
        if (chunkFile) {
          const source = fs.readFileSync(path.join(chunkDir, chunkFile), 'utf8');
          const count = countQleMatches(source);
          assert.equal(count, 1, `chunk-7nckpqfv.js should have exactly 1 match, found ${count}`);
          chunks.push({ file: chunkFile, count });
          return true;
        }
      }
    }
    return false;
  });
  if (!testRun) {
    test.skip();
  }
});

test('real chunk from 2.1.276 (if exists)', () => {
  const versions = [
    path.join(process.env.HOME || '.', '.claude-termux-native-package', 'versions', '2.1.276', 'launcher-workdir'),
  ];
  const testRun = versions.some((vdir) => {
    if (fs.existsSync(vdir)) {
      const esmDir = fs.readdirSync(vdir).find((d) => d.startsWith('esm.'));
      if (esmDir) {
        const chunkDir = path.join(vdir, esmDir);
        const chunkFile = fs.readdirSync(chunkDir).find((f) => f.match(/^chunk-0sa9p840\.js$/));
        if (chunkFile) {
          const source = fs.readFileSync(path.join(chunkDir, chunkFile), 'utf8');
          const count = countQleMatches(source);
          assert.equal(count, 1, `chunk-0sa9p840.js should have exactly 1 match, found ${count}`);
          return true;
        }
      }
    }
    return false;
  });
  if (!testRun) {
    test.skip();
  }
});
