'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const child_process = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const scriptPath = path.join(__dirname, 'termux-run-claude-native.sh');
const script = fs.readFileSync(scriptPath, 'utf8');

function extractBlock(marker, trailer) {
  const start = script.indexOf(marker);
  assert.notEqual(start, -1, `missing marker: ${marker}`);
  const bodyStart = script.indexOf('\n', start);
  assert.notEqual(bodyStart, -1, `missing body start: ${marker}`);
  const end = script.indexOf(trailer, bodyStart + 1);
  assert.notEqual(end, -1, `missing trailer: ${trailer}`);
  return script.slice(bodyStart + 1, end);
}

function extractFunction(block, startName, endName) {
  const start = block.indexOf(startName);
  assert.notEqual(start, -1, `missing function: ${startName}`);
  const end = block.indexOf(endName, start);
  assert.notEqual(end, -1, `missing end marker: ${endName}`);
  return block.slice(start, end).trimEnd();
}

function loadHelperApi() {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const replaceSource = extractFunction(
    helperBlock,
    'function replaceRequired(source, pattern, replacement, label, expectedCount) {',
    '\n\nfunction parseScalar(value) {',
  );
  const fullWidthSource = extractFunction(
    helperBlock,
    'function isFullWidthCodePoint(codePoint) {',
    '\n\nfunction graphemeWidth(grapheme) {',
  );
  const graphemeWidthSource = extractFunction(
    helperBlock,
    'function graphemeWidth(grapheme) {',
    '\n\nfunction stringWidth(value) {',
  );
  const stringWidthSource = extractFunction(
    helperBlock,
    'function stringWidth(value) {',
    '\n\nfunction stripANSI(value) {',
  );
  const stripAnsiSource = extractFunction(
    helperBlock,
    'function stripANSI(value) {',
    '\n\nfunction wrapAnsi(value, columns, options = {}) {',
  );
  const cleanupSource = extractFunction(
    helperBlock,
    'function cleanupStaleEntryFiles(currentWorkdir = workdir, currentEntryJsOffset = entryJsOffset, currentEntryEndOffset = entryEndOffset, now = Date.now()) {',
    '\n\nfunction ensureEntryFile() {',
  );
  const wrapAnsiSource = extractFunction(
    helperBlock,
    'function wrapAnsi(value, columns, options = {}) {',
    '\n\nfunction stableHash(value, seed) {',
  );
  const stableHashSource = extractFunction(
    helperBlock,
    'function stableHash(value, seed) {',
    '\n\nfunction replaceRequired(source, pattern, replacement, label, expectedCount) {',
  );
  const rewriteSource = extractFunction(
    helperBlock,
    'function rewriteNativeChunkSource(source) {',
    '\n\nasync function main() {',
  );

  const context = vm.createContext({ module: { exports: {} }, exports: {}, fs, path, process });
  vm.runInContext(
    `${replaceSource}\n${cleanupSource}\n${fullWidthSource}\n${graphemeWidthSource}\n${stripAnsiSource}\n${stringWidthSource}\n${wrapAnsiSource}\n${stableHashSource}\n${rewriteSource}\nmodule.exports = { replaceRequired, cleanupStaleEntryFiles, isFullWidthCodePoint, graphemeWidth, stripANSI, stringWidth, wrapAnsi, stableHash, rewriteNativeChunkSource };`,
    context,
  );
  return context.module.exports;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('helper and bootstrap rewrite helpers stay identical', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const bootstrapBlock = extractBlock('cat <<\'NODE\' > "$_bootstrap"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');

  const helperReplace = extractFunction(
    helperBlock,
    'function replaceRequired(source, pattern, replacement, label, expectedCount) {',
    '\n\nfunction parseScalar(value) {',
  );
  const bootstrapReplace = extractFunction(
    bootstrapBlock,
    'function replaceRequired(source, pattern, replacement, label, expectedCount) {',
    '\n\nfunction parseScalar(value) {',
  );
  const helperRewrite = extractFunction(
    helperBlock,
    'function rewriteNativeChunkSource(source) {',
    '\n\nasync function main() {',
  );
  const bootstrapRewrite = extractFunction(
    bootstrapBlock,
    'function rewriteNativeChunkSource(source) {',
    '\n\nasync function main() {',
  );
  const helperWrapAnsi = extractFunction(
    helperBlock,
    'function wrapAnsi(value, columns, options = {}) {',
    '\n\nfunction stableHash(value, seed) {',
  );
  const helperCleanup = extractFunction(
    helperBlock,
    'function cleanupStaleEntryFiles(currentWorkdir = workdir, currentEntryJsOffset = entryJsOffset, currentEntryEndOffset = entryEndOffset, now = Date.now()) {',
    '\n\nfunction ensureEntryFile() {',
  );
  const bootstrapWrapAnsi = extractFunction(
    bootstrapBlock,
    'function wrapAnsi(value, columns, options = {}) {',
    '\n\nfunction stableHash(value, seed) {',
  );
  const bootstrapCleanup = extractFunction(
    bootstrapBlock,
    'function cleanupStaleEntryFiles(currentWorkdir = workdir, currentEntryJsOffset = entryJsOffset, currentEntryEndOffset = entryEndOffset, now = Date.now()) {',
    '\n\nfunction ensureEntryFile() {',
  );
  const helperStableHash = extractFunction(
    helperBlock,
    'function stableHash(value, seed) {',
    '\n\nfunction replaceRequired(source, pattern, replacement, label, expectedCount) {',
  );
  const bootstrapStableHash = extractFunction(
    bootstrapBlock,
    'function stableHash(value, seed) {',
    '\n\nfunction replaceRequired(source, pattern, replacement, label, expectedCount) {',
  );
  const helperStringWidth = extractFunction(
    helperBlock,
    'function isFullWidthCodePoint(codePoint) {',
    '\n\nfunction graphemeWidth(grapheme) {',
  ) + '\n\n' + extractFunction(
    helperBlock,
    'function graphemeWidth(grapheme) {',
    '\n\nfunction stringWidth(value) {',
  ) + '\n\n' + extractFunction(
    helperBlock,
    'function stringWidth(value) {',
    '\n\nfunction stripANSI(value) {',
  );
  const bootstrapStringWidth = extractFunction(
    bootstrapBlock,
    'function isFullWidthCodePoint(codePoint) {',
    '\n\nfunction graphemeWidth(grapheme) {',
  ) + '\n\n' + extractFunction(
    bootstrapBlock,
    'function graphemeWidth(grapheme) {',
    '\n\nfunction stringWidth(value) {',
  ) + '\n\n' + extractFunction(
    bootstrapBlock,
    'function stringWidth(value) {',
    '\n\nfunction stripANSI(value) {',
  );

  assert.equal(helperReplace, bootstrapReplace);
  assert.equal(helperRewrite, bootstrapRewrite);
  assert.equal(helperWrapAnsi, bootstrapWrapAnsi);
  assert.equal(helperCleanup, bootstrapCleanup);
  assert.equal(helperStableHash, bootstrapStableHash);
  assert.equal(helperStringWidth, bootstrapStringWidth);
});

test('print path does not defer cleanup to exit', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');

  assert.equal(helperBlock.includes('CLAUDE_TERMUX_PRINT_WAIT_MS'), true);
  assert.equal(helperBlock.includes('setTimeout(resolve, printWaitMs)'), true);
  assert.equal(helperBlock.includes('process.once(\'exit\''), false);
  assert.equal(helperBlock.includes('process.removeListener(\'uncaughtException\''), true);
});

test('bootstrap path defers cleanup to exit', () => {
  const bootstrapBlock = extractBlock('cat <<\'NODE\' > "$_bootstrap"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');

  assert.equal(bootstrapBlock.includes('CLAUDE_TERMUX_PRINT_WAIT_MS'), false);
  assert.equal(bootstrapBlock.includes('setTimeout(resolve, printWaitMs)'), false);
  assert.equal(bootstrapBlock.includes('process.once(\'exit\''), true);
  assert.equal(bootstrapBlock.includes('process.removeListener(\'uncaughtException\''), true);
});

test('entry extraction uses a process-unique filename', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const bootstrapBlock = extractBlock('cat <<\'NODE\' > "$_bootstrap"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');

  assert.equal(helperBlock.includes('process.pid'), true);
  assert.equal(helperBlock.includes('Math.random'), true);
  assert.equal(bootstrapBlock.includes('process.pid'), true);
  assert.equal(bootstrapBlock.includes('Math.random'), true);
});

test('replaceRequired enforces the expected replacement count', () => {
  const { replaceRequired } = loadHelperApi();

  assert.equal(replaceRequired('abc abc', /abc/g, 'x', 'abc', 2), 'x x');
  assert.throws(
    () => replaceRequired('abc abc', /abc/g, 'x', 'abc', 1),
    /unexpected abc count 2/,
  );
});

test('stringWidth treats full-width and combining text as expected', () => {
  const { stringWidth } = loadHelperApi();

  assert.equal(stringWidth('abc'), 3);
  assert.equal(stringWidth('あ'), 2);
  assert.equal(stringWidth('a\u0301'), 1);
  assert.equal(stringWidth('🙂'), 2);
  assert.equal(stringWidth('🚀'), 2);
  assert.equal(stringWidth('🚗'), 2);
  assert.equal(stringWidth('❤️'), 2);
  assert.equal(stringWidth('☕️'), 2);
  assert.equal(stringWidth('🇯🇵'), 2);
  assert.equal(stringWidth('#️⃣'), 2);
  assert.equal(stringWidth('👨‍👩‍👧‍👦'), 2);
  assert.equal(stringWidth('\u001b[31mあ\u001b[0m'), 2);
  assert.equal(stringWidth('\u001b[36m🇯🇵\u001b[0m'), 2);
});

test('stableHash incorporates the optional seed', () => {
  const { stableHash } = loadHelperApi();

  assert.equal(stableHash('abc', 123), stableHash('abc', 123));
  assert.notEqual(stableHash('abc', 123), stableHash('abc', 456));
});

test('wrapAnsi respects soft wrap, trim, and no-wrap options', () => {
  const { wrapAnsi } = loadHelperApi();

  assert.equal(wrapAnsi('abc def', 4, { hard: false }), 'abc\ndef');
  assert.equal(wrapAnsi('   abc', 10, { trim: true }), 'abc');
  assert.equal(wrapAnsi('abc   ', 10, { trim: true }), 'abc');
  assert.equal(wrapAnsi('abc def', 3, { wordWrap: false }).includes('\n'), true);
  assert.equal(wrapAnsi('ab\u001b[31mcd', 3).includes('\n'), true);
});

test('cleanupStaleEntryFiles removes only stale extracted files for the same offsets', () => {
  const { cleanupStaleEntryFiles } = loadHelperApi();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-termux-'));
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, 'work-'));
  const stale = path.join(tmpdir, 'cli.11.22.123.old.bare-path.js');
  const fresh = path.join(tmpdir, 'cli.11.22.456.new.bare-path.js');
  const otherOffsets = path.join(tmpdir, 'cli.33.44.999.old.bare-path.js');
  try {
    fs.writeFileSync(stale, 'stale');
    fs.writeFileSync(fresh, 'fresh');
    fs.writeFileSync(otherOffsets, 'other');
    const oldTime = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000));
    fs.utimesSync(stale, oldTime, oldTime);
    fs.utimesSync(otherOffsets, oldTime, oldTime);

    cleanupStaleEntryFiles(tmpdir, 11, 22, Date.now());

    assert.equal(fs.existsSync(stale), false);
    assert.equal(fs.existsSync(fresh), true);
    assert.equal(fs.existsSync(otherOffsets), true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

function buildSyntheticBundleSource() {
  const typeofBun = Array.from({ length: 6 }, () => 'typeof Bun').join('; ');
  const bunProps = Array.from({ length: 37 }, (_, index) => `Bun.p${index}`).join('; ');
  return `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0 }`;
}

test('rewriteNativeChunkSource rewrites the synthetic bundle slice (version 2.1.198)', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.198';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const source = buildSyntheticBundleSource();
    const patched = rewriteNativeChunkSource(source);

    assert.match(patched, /var __claudeBun = globalThis\.__claudeBunShim;/);
    assert.match(patched, /typeof __claudeBun/);
    assert.match(patched, /typeof globalThis\.__claudeBun/);
    assert.match(patched, /globalThis\.__claudeBun/);
    assert.match(patched, /__claudeBun\./);
    assert.match(patched, /npmInstallDeprecated:!1/);
    assert.doesNotMatch(patched, /npmInstallDeprecated:!0/);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rewrites the synthetic bundle slice (version 2.1.200)', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.200';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 40 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0 }`;
    const patched = rewriteNativeChunkSource(source);

    assert.match(patched, /var __claudeBun = globalThis\.__claudeBunShim;/);
    assert.match(patched, /typeof __claudeBun/);
    assert.match(patched, /typeof globalThis\.__claudeBun/);
    assert.match(patched, /globalThis\.__claudeBun/);
    assert.match(patched, /__claudeBun\./);
    assert.match(patched, /npmInstallDeprecated:!1/);
    assert.doesNotMatch(patched, /npmInstallDeprecated:!0/);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rewrites the synthetic bundle slice (version 2.1.202)', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.202';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 41 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0 }`;
    const patched = rewriteNativeChunkSource(source);

    assert.match(patched, /var __claudeBun = globalThis\.__claudeBunShim;/);
    assert.match(patched, /typeof __claudeBun/);
    assert.match(patched, /typeof globalThis\.__claudeBun/);
    assert.match(patched, /globalThis\.__claudeBun/);
    assert.match(patched, /__claudeBun\./);
    assert.match(patched, /npmInstallDeprecated:!1/);
    assert.doesNotMatch(patched, /npmInstallDeprecated:!0/);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rewrites the synthetic bundle slice (version 2.1.203)', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.203';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 41 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0 }`;
    const patched = rewriteNativeChunkSource(source);

    assert.match(patched, /var __claudeBun = globalThis\.__claudeBunShim;/);
    assert.match(patched, /typeof __claudeBun/);
    assert.match(patched, /typeof globalThis\.__claudeBun/);
    assert.match(patched, /globalThis\.__claudeBun/);
    assert.match(patched, /__claudeBun\./);
    assert.match(patched, /npmInstallDeprecated:!1/);
    assert.doesNotMatch(patched, /npmInstallDeprecated:!0/);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rewrites the synthetic bundle slice (version 2.1.205)', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.205';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 38 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0 }`;
    const patched = rewriteNativeChunkSource(source);

    assert.match(patched, /var __claudeBun = globalThis\.__claudeBunShim;/);
    assert.match(patched, /typeof __claudeBun/);
    assert.match(patched, /typeof globalThis\.__claudeBun/);
    assert.match(patched, /globalThis\.__claudeBun/);
    assert.match(patched, /__claudeBun\./);
    assert.match(patched, /npmInstallDeprecated:!1/);
    assert.doesNotMatch(patched, /npmInstallDeprecated:!0/);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rejects stale Bun property access count for version 2.1.205', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.205';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 41 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0 }`;

    assert.throws(
      () => rewriteNativeChunkSource(source),
      /unexpected Bun property access count 41/,
    );
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rewrites the synthetic bundle slice (version 2.1.214)', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.214';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 39 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0 }`;
    const patched = rewriteNativeChunkSource(source);

    assert.match(patched, /var __claudeBun = globalThis\.__claudeBunShim;/);
    assert.match(patched, /typeof __claudeBun/);
    assert.match(patched, /typeof globalThis\.__claudeBun/);
    assert.match(patched, /globalThis\.__claudeBun/);
    assert.match(patched, /__claudeBun\./);
    assert.match(patched, /npmInstallDeprecated:!1/);
    assert.doesNotMatch(patched, /npmInstallDeprecated:!0/);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rejects stale Bun property access count for version 2.1.214', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.214';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 38 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0 }`;

    assert.throws(
      () => rewriteNativeChunkSource(source),
      /unexpected Bun property access count 38/,
    );
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rejects unexpected replacement counts', () => {
  const { rewriteNativeChunkSource } = loadHelperApi();
  const source = buildSyntheticBundleSource().replace('Bun.p30;', '');

  assert.throws(
    () => rewriteNativeChunkSource(source),
    /unexpected Bun property access count 36/,
  );
});

const packageVersion = require('../package.json').version;
const tarballPath = path.join(__dirname, '..', `bash0816-claude-code-${packageVersion}.tgz`);

test('tarball contents match the workspace runner and test file', { skip: !fs.existsSync(tarballPath) }, () => {
  const tarRunner = child_process.execFileSync('tar', ['-xOf', tarballPath, 'package/lib/termux-run-claude-native.sh']);
  const tarTest = child_process.execFileSync('tar', ['-xOf', tarballPath, 'package/lib/termux-run-claude-native.test.js']);

  const worktreeRunner = fs.readFileSync(path.join(__dirname, 'termux-run-claude-native.sh'));
  const worktreeTest = fs.readFileSync(path.join(__dirname, 'termux-run-claude-native.test.js'));

  assert.equal(crypto.createHash('sha256').update(tarRunner).digest('hex'), crypto.createHash('sha256').update(worktreeRunner).digest('hex'));
  assert.equal(crypto.createHash('sha256').update(tarTest).digest('hex'), crypto.createHash('sha256').update(worktreeTest).digest('hex'));
  assert.equal(tarRunner.length, worktreeRunner.length);
  assert.equal(tarTest.length, worktreeTest.length);
});

test('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC is never forced (regression guard)', () => {
  assert.equal(script.includes('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'), false);
});
