'use strict';

const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const child_process = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const scriptPath = path.join(__dirname, 'termux-run-claude-native.sh');
const script = fs.readFileSync(scriptPath, 'utf8');

// Fixtures below don't include the /background isEnabled pattern, so
// rewriteNativeChunkSource must run with the patch disabled (its default)
// regardless of what the ambient shell happens to export.
delete process.env.CLAUDE_CODE_DISABLE_AGENT_VIEW;

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
    '\n\nasync function esmChunkedMain() {',
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
    '\n\nasync function esmChunkedMain() {',
  );
  const bootstrapRewrite = extractFunction(
    bootstrapBlock,
    'function rewriteNativeChunkSource(source) {',
    '\n\nasync function esmChunkedMain() {',
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

  assert.equal(bootstrapBlock.includes('process.once(\'exit\''), true);
  assert.equal(bootstrapBlock.includes('process.removeListener(\'uncaughtException\''), true);
});

test('bootstrap branch exports CLAUDE_TERMUX_PRINT_MODE before invoking node', () => {
  const bootstrapShellRegion = extractFunction(
    script,
    'export CLAUDE_TERMUX_TUI="${_tui}"',
    'cat <<\'NODE\' > "$_bootstrap"',
  );
  assert.equal(bootstrapShellRegion.includes('export CLAUDE_TERMUX_PRINT_MODE="${_pf}"'), true);
});

test('helper and bootstrap wait for print flush, including the RequestedExit path', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const bootstrapBlock = extractBlock('cat <<\'NODE\' > "$_bootstrap"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');

  assert.equal(helperBlock.includes('async function waitForPrintFlush()'), true);
  assert.equal(helperBlock.includes('await waitForPrintFlush();\n    if (asyncErrors.length > 0) throw asyncErrors[0];'), true);
  assert.equal(helperBlock.includes('process.exitCode = error.code;\n      await waitForPrintFlush();\n      return;'), true);

  assert.equal(bootstrapBlock.includes('async function waitForPrintFlushIfNeeded()'), true);
  assert.equal(bootstrapBlock.includes('await waitForPrintFlushIfNeeded();\n    if (asyncErrors.length > 0) throw asyncErrors[0];'), true);
  assert.equal(bootstrapBlock.includes('process.exitCode = error.code;\n      await waitForPrintFlushIfNeeded();\n      return;'), true);
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
  return `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;
}

test('rewriteNativeChunkSource disables the bg-pty-host factory', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.198';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const patched = rewriteNativeChunkSource(buildSyntheticBundleSource());
    const start = patched.indexOf('function dYs(){');
    assert.notEqual(start, -1);
    let depth = 0;
    let end = -1;
    for (let index = start; index < patched.length; index += 1) {
      if (patched[index] === '{') depth += 1;
      if (patched[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }
    assert.notEqual(end, -1);
    const rewrittenFactory = eval('(' + patched.slice(start, end) + ')');
    assert.equal(rewrittenFactory(), undefined);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

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
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;
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
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;
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
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;
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
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;
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
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;

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
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;
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
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;

    assert.throws(
      () => rewriteNativeChunkSource(source),
      /unexpected Bun property access count 38/,
    );
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rewrites the synthetic bundle slice (version 2.1.216)', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.216';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 40 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;
    const patched = rewriteNativeChunkSource(source);

    assert.match(patched, /var __claudeBun = globalThis\.__claudeBunShim;/);
    assert.match(patched, /typeof __claudeBun/);
    assert.match(patched, /typeof globalThis\.__claudeBun/);
    assert.match(patched, /globalThis\.__claudeBun/);
    assert.match(patched, /__claudeBun\./);
    assert.equal((patched.match(/__claudeBun\./g) || []).length, 40);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rejects stale Bun property access count for version 2.1.216', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.216';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 39 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;

    assert.throws(
      () => rewriteNativeChunkSource(source),
      /unexpected Bun property access count 39/,
    );
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rewrites the synthetic bundle slice (version 2.1.219)', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.219';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 42 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;
    const patched = rewriteNativeChunkSource(source);

    assert.match(patched, /var __claudeBun = globalThis\.__claudeBunShim;/);
    assert.match(patched, /typeof __claudeBun/);
    assert.match(patched, /typeof globalThis\.__claudeBun/);
    assert.match(patched, /globalThis\.__claudeBun/);
    assert.match(patched, /__claudeBun\./);
    assert.equal((patched.match(/__claudeBun\./g) || []).length, 42);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rejects stale Bun property access count for version 2.1.219', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.219';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 41 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;

    assert.throws(
      () => rewriteNativeChunkSource(source),
      /unexpected Bun property access count 41/,
    );
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rewrites the synthetic bundle slice (version 2.1.223)', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.223';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 43 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;
    const patched = rewriteNativeChunkSource(source);

    assert.match(patched, /var __claudeBun = globalThis\.__claudeBunShim;/);
    assert.match(patched, /typeof __claudeBun/);
    assert.match(patched, /typeof globalThis\.__claudeBun/);
    assert.match(patched, /globalThis\.__claudeBun/);
    assert.match(patched, /__claudeBun\./);
    assert.equal((patched.match(/__claudeBun\./g) || []).length, 43);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rejects stale Bun property access count for version 2.1.223', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.223';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 42 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;

    assert.throws(
      () => rewriteNativeChunkSource(source),
      /unexpected Bun property access count 42/,
    );
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rewrites the synthetic bundle slice (version 2.1.232)', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.232';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 45 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;
    const patched = rewriteNativeChunkSource(source);

    assert.match(patched, /var __claudeBun = globalThis\.__claudeBunShim;/);
    assert.match(patched, /typeof __claudeBun/);
    assert.match(patched, /typeof globalThis\.__claudeBun/);
    assert.match(patched, /globalThis\.__claudeBun/);
    assert.match(patched, /__claudeBun\./);
    assert.equal((patched.match(/__claudeBun\./g) || []).length, 45);
  } finally {
    delete process.env.CURRENT_CLAUDE_VERSION;
  }
});

test('rewriteNativeChunkSource rejects stale Bun property access count for version 2.1.232', () => {
  process.env.CURRENT_CLAUDE_VERSION = '2.1.232';
  try {
    const { rewriteNativeChunkSource } = loadHelperApi();
    const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
    const bunProps = Array.from({ length: 44 }, (_, index) => `Bun.p${index}`).join('; ');
    const source = `function(exports, require, module, __filename, __dirname) { ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps}; npmInstallDeprecated:!0; npmInstallDeprecated:!0; function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}} }`;

    assert.throws(
      () => rewriteNativeChunkSource(source),
      /unexpected Bun property access count 44/,
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

function buildScenarioFixtureSource() {
  const typeofBun = Array.from({ length: 7 }, () => 'typeof Bun').join('; ');
  const bunProps = Array.from({ length: 42 }, (_, i) => `Bun.p${i}`).join('; ');
  return `function(exports, require, module, __filename, __dirname) {
    ${typeofBun}; typeof globalThis.Bun; globalThis.Bun; ${bunProps};
    npmInstallDeprecated:!0; npmInstallDeprecated:!0;
    function dYs(){return(e,t,r)=>{let{cmd:n,prefixArgs:o}=ox({pinToCurrentBinary:!0}),i=[n,...o,"--bg-pty-host",r.ptySock];return i}}
    const scenario = process.env.TEST_SCENARIO;
    if (scenario === 'sync-exit') { process.stdout.write('ok'); process.exit(0); return; }
    if (scenario === 'async-exit') {
      setTimeout(() => { process.stdout.write('ok'); }, 100).unref();
      return;
    }
    if (scenario === 'self-sigkill-fallback-string') {
      try {
        process.exit(17);
      } catch (e) {
        process.kill(process.pid, 'SIGKILL');
      }
      return;
    }
    if (scenario === 'self-sigkill-fallback-numeric') {
      try {
        process.exit(17);
      } catch (e) {
        process.kill(process.pid, 9);
      }
      return;
    }
    if (scenario === 'self-sigkill-fallback-no-code') {
      try {
        process.exit();
      } catch (e) {
        process.kill(process.pid, 'SIGKILL');
      }
      return;
    }
    if (scenario === 'other-process-kill') {
      const cp = require('child_process');
      const child = cp.spawn('node', ['-e', 'setTimeout(() => {}, 5000)']);
      const childPid = child.pid;
      process.kill(childPid, 0);
      child.kill();
      process.stdout.write('ok');
      return;
    }
    if (scenario === 'stream-json-result') {
      process.stdout.write('{"type":"init"}\\n');
      const msg = '{"type":"result","data":"test"}\\n';
      process.stdout.write(msg, undefined, () => {});
      return;
    }
    if (scenario === 'stream-json-multibyte-split') {
      // Split a UTF-8 multi-byte character across write calls
      // 'あ' is 3 bytes in UTF-8: e3 81 82
      const buf = Buffer.from('あ', 'utf8');
      // Split the 3-byte character: first byte in one write, remaining in another
      const jsonLine = '{"type":"result"}\\n';
      const part1 = Buffer.concat([Buffer.from(jsonLine), buf.slice(0, 1)]);
      const part2 = Buffer.concat([buf.slice(1)]);
      process.stdout.write(part1);
      process.stdout.write(part2, undefined, () => {});
      return;
    }
    if (scenario === 'stream-json-timeout') {
      process.stdout.write('{"type":"init"}\\n');
      setTimeout(() => {}, 5000);
      return;
    }
    if (scenario === 'stream-json-requested-exit-then-result') {
      process.stdout.write('{"type":"result"}\\n');
      process.exit(0);
      return;
    }
    if (scenario === 'plain-late-write') {
      setTimeout(() => { process.stdout.write('late-output'); }, 800);
      return;
    }
    if (scenario === 'plain-no-output-error') {
      process.exitCode = 1;
      return;
    }
    if (scenario === 'plain-no-output-success') {
      return;
    }
    process.stdout.write('ok');
  }`;
}

function runScenario({ printMode, stdinInherit, scenario, extraArgs, extraEnv }) {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-stdin-test-'));
  const sourceBin = path.join(tmpBase, 'fake-source.js');
  const fixtureSource = buildScenarioFixtureSource();
  fs.writeFileSync(sourceBin, fixtureSource, 'utf8');
  const entryJsOffset = 0;
  const entryEndOffset = Buffer.byteLength(fixtureSource, 'utf8');
  const workdir = path.join(tmpBase, 'workdir');
  fs.mkdirSync(workdir, { recursive: true });

  const env = {
    ...process.env,
    SOURCE_BIN: sourceBin,
    WORKDIR: workdir,
    ENTRY_JS_OFFSET: String(entryJsOffset),
    ENTRY_END_OFFSET: String(entryEndOffset),
    CURRENT_CLAUDE_VERSION: '2.1.220',
    CLAUDE_TERMUX_PACKAGE_DIR: path.join(__dirname, '..'),
    MAGI_ENV: '1',
    CLAUDE_TERMUX_PRINT_WAIT_MS: '300',
    TMPDIR: tmpBase,
    TEST_SCENARIO: scenario,
    ...(extraEnv || {}),
  };
  if (stdinInherit) env.CLAUDE_TERMUX_STDIN = 'inherit';
  else delete env.CLAUDE_TERMUX_STDIN;

  const args = printMode ? ['-p', 'x', ...(extraArgs || [])] : [];
  const start = Date.now();
  const result = child_process.spawnSync('sh', [scriptPath, ...args], {
    env,
    input: 'test input\n',
    encoding: 'utf8',
    timeout: 10000,
  });
  const elapsedMs = Date.now() - start;
  return { ...result, elapsedMs, tmpBase };
}

test('helper and bootstrap intercept process.kill(self, SIGKILL) statically', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const bootstrapBlock = extractBlock('cat <<\'NODE\' > "$_bootstrap"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');

  // Check helper branch
  const helperOriginalKillIdx = helperBlock.indexOf('const originalKill = process.kill;');
  assert.ok(helperOriginalKillIdx > -1, 'helper: missing originalKill declaration');

  const helperProcessKillIdx = helperBlock.indexOf('process.kill = (pid, signal) => {', helperOriginalKillIdx);
  assert.ok(helperProcessKillIdx > helperOriginalKillIdx, 'helper: process.kill override must come after originalKill declaration');

  const helperRestoreIdx = helperBlock.indexOf('process.kill = originalKill;', helperProcessKillIdx);
  assert.ok(helperRestoreIdx > helperProcessKillIdx, 'helper: process.kill restoration must come after override');

  // Verify SIGKILL check within the override
  const helperKillOverrideEnd = helperBlock.indexOf('};', helperProcessKillIdx);
  const helperKillOverride = helperBlock.slice(helperProcessKillIdx, helperKillOverrideEnd);
  assert.ok(helperKillOverride.includes('signal === \'SIGKILL\''), 'helper: process.kill must check for SIGKILL string');
  assert.ok(helperKillOverride.includes('signal === 9'), 'helper: process.kill must check for SIGKILL numeric value');
  assert.ok(helperKillOverride.includes('throw new RequestedExit'), 'helper: process.kill must throw RequestedExit for self SIGKILL');

  // Check bootstrap branch
  const bootstrapOriginalKillIdx = bootstrapBlock.indexOf('const originalKill = process.kill;');
  assert.ok(bootstrapOriginalKillIdx > -1, 'bootstrap: missing originalKill declaration');

  const bootstrapProcessKillIdx = bootstrapBlock.indexOf('process.kill = (pid, signal) => {', bootstrapOriginalKillIdx);
  assert.ok(bootstrapProcessKillIdx > bootstrapOriginalKillIdx, 'bootstrap: process.kill override must come after originalKill declaration');

  const bootstrapRestoreIdx = bootstrapBlock.indexOf('process.kill = originalKill;', bootstrapProcessKillIdx);
  assert.ok(bootstrapRestoreIdx > bootstrapProcessKillIdx, 'bootstrap: process.kill restoration must come after override');

  // Verify SIGKILL check within the override
  const bootstrapKillOverrideEnd = bootstrapBlock.indexOf('};', bootstrapProcessKillIdx);
  const bootstrapKillOverride = bootstrapBlock.slice(bootstrapProcessKillIdx, bootstrapKillOverrideEnd);
  assert.ok(bootstrapKillOverride.includes('signal === \'SIGKILL\''), 'bootstrap: process.kill must check for SIGKILL string');
  assert.ok(bootstrapKillOverride.includes('signal === 9'), 'bootstrap: process.kill must check for SIGKILL numeric value');
  assert.ok(bootstrapKillOverride.includes('throw new RequestedExit'), 'bootstrap: process.kill must throw RequestedExit for self SIGKILL');
});

test('helper branch (CLI -p, no stdin inherit): normal/sync-exit/async-exit all produce output', () => {
  for (const scenario of ['normal', 'sync-exit', 'async-exit']) {
    const r = runScenario({ printMode: true, stdinInherit: false, scenario });
    try {
      assert.ok((r.stdout || '').includes('ok'), `scenario=${scenario} stdout=${r.stdout} stderr=${r.stderr}`);
      assert.equal(r.status, 0, `scenario=${scenario} status=${r.status} stderr=${r.stderr}`);
    } finally {
      fs.rmSync(r.tmpBase, { recursive: true, force: true });
    }
  }
});

test('bootstrap branch (-p + CLAUDE_TERMUX_STDIN=inherit): normal/sync-exit/async-exit all produce output', () => {
  for (const scenario of ['normal', 'sync-exit', 'async-exit']) {
    const r = runScenario({ printMode: true, stdinInherit: true, scenario });
    try {
      assert.ok((r.stdout || '').includes('ok'), `scenario=${scenario} stdout=${r.stdout} stderr=${r.stderr}`);
      assert.equal(r.status, 0, `scenario=${scenario} status=${r.status} stderr=${r.stderr}`);
    } finally {
      fs.rmSync(r.tmpBase, { recursive: true, force: true });
    }
  }
});

test('helper branch plain mode waits for late write beyond default printWaitMs', () => {
  const r = runScenario({ printMode: true, stdinInherit: false, scenario: 'plain-late-write' });
  try {
    assert.ok((r.stdout || '').includes('late-output'), `stdout=${r.stdout} stderr=${r.stderr}`);
    assert.equal(r.status, 0, `status=${r.status} stderr=${r.stderr}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('bootstrap branch plain mode waits for late write beyond default printWaitMs', () => {
  const r = runScenario({ printMode: true, stdinInherit: true, scenario: 'plain-late-write' });
  try {
    assert.ok((r.stdout || '').includes('late-output'), `stdout=${r.stdout} stderr=${r.stderr}`);
    assert.equal(r.status, 0, `status=${r.status} stderr=${r.stderr}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('helper branch plain mode with no output and non-zero exitCode exits promptly (no extended wait)', () => {
  const r = runScenario({ printMode: true, stdinInherit: false, scenario: 'plain-no-output-error' });
  try {
    assert.equal(r.status, 1, `status=${r.status} stderr=${r.stderr}`);
    assert.ok(r.elapsedMs < 5000, `expected prompt exit, got elapsedMs=${r.elapsedMs}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('bootstrap branch plain mode with no output and non-zero exitCode exits promptly (no extended wait)', () => {
  const r = runScenario({ printMode: true, stdinInherit: true, scenario: 'plain-no-output-error' });
  try {
    assert.equal(r.status, 1, `status=${r.status} stderr=${r.stderr}`);
    assert.ok(r.elapsedMs < 5000, `expected prompt exit, got elapsedMs=${r.elapsedMs}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('helper branch plain mode with no output and successful exit waits up to configured ceiling', () => {
  const r = runScenario({
    printMode: true,
    stdinInherit: false,
    scenario: 'plain-no-output-success',
    extraEnv: { CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS: '400' },
  });
  try {
    assert.equal(r.status, 0, `status=${r.status} stderr=${r.stderr}`);
    assert.ok(r.elapsedMs >= 350, `expected extended wait close to 400ms ceiling, got elapsedMs=${r.elapsedMs}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('bootstrap branch plain mode with no output and successful exit waits up to configured ceiling', () => {
  const r = runScenario({
    printMode: true,
    stdinInherit: true,
    scenario: 'plain-no-output-success',
    extraEnv: { CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS: '400' },
  });
  try {
    assert.equal(r.status, 0, `status=${r.status} stderr=${r.stderr}`);
    assert.ok(r.elapsedMs >= 350, `expected extended wait close to 400ms ceiling, got elapsedMs=${r.elapsedMs}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('helper branch intercepts self-directed SIGKILL (string signal) and exits with proper code', () => {
  const r = runScenario({ printMode: true, stdinInherit: false, scenario: 'self-sigkill-fallback-string' });
  try {
    assert.equal(r.status, 17, `expected status 17, got ${r.status}; stderr=${r.stderr}`);
    assert.ok(!r.signal, `expected clean exit (no signal), but got signal: ${r.signal}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('helper branch intercepts self-directed SIGKILL (numeric signal 9) and exits with proper code', () => {
  const r = runScenario({ printMode: true, stdinInherit: false, scenario: 'self-sigkill-fallback-numeric' });
  try {
    assert.equal(r.status, 17, `expected status 17, got ${r.status}; stderr=${r.stderr}`);
    assert.ok(!r.signal, `expected clean exit (no signal), but got signal: ${r.signal}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('helper branch intercepts self-directed SIGKILL with process.exit() (no code) and defaults to 0', () => {
  const r = runScenario({ printMode: true, stdinInherit: false, scenario: 'self-sigkill-fallback-no-code' });
  try {
    assert.equal(r.status, 0, `expected status 0, got ${r.status}; stderr=${r.stderr}`);
    assert.ok(!r.signal, `expected clean exit (no signal), but got signal: ${r.signal}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('helper branch allows process.kill to other processes (signal 0, passthrough)', () => {
  const r = runScenario({ printMode: true, stdinInherit: false, scenario: 'other-process-kill' });
  try {
    assert.ok((r.stdout || '').includes('ok'), `expected ok output, got stdout=${r.stdout} stderr=${r.stderr}`);
    assert.equal(r.status, 0, `expected status 0, got ${r.status}; stderr=${r.stderr}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('isStreamJsonPrintMode detects print flag and stream-json format (case 1: -p + format + value)', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const fnSource = extractFunction(helperBlock, 'function isStreamJsonPrintMode(argv) {', '\n\nclass RequestedExit');
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(`${fnSource}\nmodule.exports = isStreamJsonPrintMode;`, context);
  const isStreamJsonPrintMode = context.module.exports;

  assert.equal(isStreamJsonPrintMode(['-p', 'hello', '--output-format', 'stream-json']), true, 'case 1');
  assert.equal(isStreamJsonPrintMode(['-p', 'hello', '--output-format=stream-json']), true, 'case 2');
  assert.equal(isStreamJsonPrintMode(['--print', '--output-format=stream-json']), true, 'case 3');
  assert.equal(isStreamJsonPrintMode(['-p', 'hello', '--output-format', 'json']), false, 'case 4');
  assert.equal(isStreamJsonPrintMode(['-p']), false, 'case 5');
  assert.equal(isStreamJsonPrintMode(['--output-format=stream-json']), false, 'case 6');
  assert.equal(isStreamJsonPrintMode(['-p', '--', '--output-format=stream-json']), false, 'case 7');
  assert.equal(isStreamJsonPrintMode(['-p', '--output-format=stream-json', '--', 'extra']), true, 'case 8');
  assert.equal(isStreamJsonPrintMode(['-p', '--output-format', '--', 'stream-json']), false, 'case 9');
  assert.equal(isStreamJsonPrintMode(['-p', '--output-format']), false, 'case 10');
  assert.equal(isStreamJsonPrintMode([]), false, 'case 11');
});

test('isStreamJsonPrintMode is identical in helper and bootstrap', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const bootstrapBlock = extractBlock('cat <<\'NODE\' > "$_bootstrap"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');

  const helperFn = extractFunction(helperBlock, 'function isStreamJsonPrintMode(argv) {', '\n\nclass RequestedExit');
  const bootstrapFn = extractFunction(bootstrapBlock, 'function isStreamJsonPrintMode(argv) {', '\n\nclass RequestedExit');

  assert.equal(helperFn, bootstrapFn, 'isStreamJsonPrintMode must be identical in both heredocs');
});

test('CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS fallback to 300000 on NaN', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-timeout-test-'));
  try {
    const sourceBin = path.join(tmpBase, 'fake-source.js');
    const fixtureSource = buildScenarioFixtureSource();
    fs.writeFileSync(sourceBin, fixtureSource, 'utf8');
    const entryJsOffset = 0;
    const entryEndOffset = Buffer.byteLength(fixtureSource, 'utf8');
    const workdir = path.join(tmpBase, 'workdir');
    fs.mkdirSync(workdir, { recursive: true });

    const env = {
      ...process.env,
      SOURCE_BIN: sourceBin,
      WORKDIR: workdir,
      ENTRY_JS_OFFSET: String(entryJsOffset),
      ENTRY_END_OFFSET: String(entryEndOffset),
      CURRENT_CLAUDE_VERSION: '2.1.220',
      CLAUDE_TERMUX_PACKAGE_DIR: path.join(__dirname, '..'),
      MAGI_ENV: '1',
      CLAUDE_TERMUX_PRINT_WAIT_MS: '300',
      CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS: 'invalid',
      TMPDIR: tmpBase,
      TEST_SCENARIO: 'stream-json-result',
    };
    delete env.CLAUDE_TERMUX_STDIN;

    const result = child_process.spawnSync('sh', [scriptPath, '-p', 'x', '--output-format=stream-json'], {
      env,
      input: 'test input\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0, `expected successful exit with invalid timeout fallback, got status=${result.status} stderr=${result.stderr}`);
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS fallback to 300000 on zero', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-timeout-test-'));
  try {
    const sourceBin = path.join(tmpBase, 'fake-source.js');
    const fixtureSource = buildScenarioFixtureSource();
    fs.writeFileSync(sourceBin, fixtureSource, 'utf8');
    const entryJsOffset = 0;
    const entryEndOffset = Buffer.byteLength(fixtureSource, 'utf8');
    const workdir = path.join(tmpBase, 'workdir');
    fs.mkdirSync(workdir, { recursive: true });

    const env = {
      ...process.env,
      SOURCE_BIN: sourceBin,
      WORKDIR: workdir,
      ENTRY_JS_OFFSET: String(entryJsOffset),
      ENTRY_END_OFFSET: String(entryEndOffset),
      CURRENT_CLAUDE_VERSION: '2.1.220',
      CLAUDE_TERMUX_PACKAGE_DIR: path.join(__dirname, '..'),
      MAGI_ENV: '1',
      CLAUDE_TERMUX_PRINT_WAIT_MS: '300',
      CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS: '0',
      TMPDIR: tmpBase,
      TEST_SCENARIO: 'stream-json-result',
    };
    delete env.CLAUDE_TERMUX_STDIN;

    const result = child_process.spawnSync('sh', [scriptPath, '-p', 'x', '--output-format=stream-json'], {
      env,
      input: 'test input\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0, `expected successful exit with zero timeout fallback, got status=${result.status} stderr=${result.stderr}`);
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('helper branch (CLI -p, no stdin inherit) stream-json: result detected -> exits immediately without waiting for timeout', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-stream-json-clear-timeout-'));
  try {
    const sourceBin = path.join(tmpBase, 'fake-source.js');
    const fixtureSource = buildScenarioFixtureSource();
    fs.writeFileSync(sourceBin, fixtureSource, 'utf8');
    const entryJsOffset = 0;
    const entryEndOffset = Buffer.byteLength(fixtureSource, 'utf8');
    const workdir = path.join(tmpBase, 'workdir');
    fs.mkdirSync(workdir, { recursive: true });

    const env = {
      ...process.env,
      SOURCE_BIN: sourceBin,
      WORKDIR: workdir,
      ENTRY_JS_OFFSET: String(entryJsOffset),
      ENTRY_END_OFFSET: String(entryEndOffset),
      CURRENT_CLAUDE_VERSION: '2.1.220',
      CLAUDE_TERMUX_PACKAGE_DIR: path.join(__dirname, '..'),
      MAGI_ENV: '1',
      CLAUDE_TERMUX_PRINT_WAIT_MS: '300',
      CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS: '10000',
      TMPDIR: tmpBase,
      TEST_SCENARIO: 'stream-json-result',
    };
    delete env.CLAUDE_TERMUX_STDIN;

    const start = Date.now();
    const result = child_process.spawnSync('sh', [scriptPath, '-p', 'x', '--output-format=stream-json'], {
      env,
      input: 'test input\n',
      encoding: 'utf8',
      timeout: 20000,
    });
    const elapsedMs = Date.now() - start;

    assert.equal(result.status, 0, `expected successful exit, got status=${result.status} stderr=${result.stderr}`);
    assert.ok(
      elapsedMs < 3000,
      `expected process to exit quickly after result detected, but elapsed=${elapsedMs}ms (should be < 3000ms with 10000ms timeout). This indicates the timeout timer was not cleared.`
    );
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('bootstrap branch (-p + CLAUDE_TERMUX_STDIN=inherit) stream-json: result detected -> exits immediately without waiting for timeout', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-stream-json-clear-timeout-bootstrap-'));
  try {
    const sourceBin = path.join(tmpBase, 'fake-source.js');
    const fixtureSource = buildScenarioFixtureSource();
    fs.writeFileSync(sourceBin, fixtureSource, 'utf8');
    const entryJsOffset = 0;
    const entryEndOffset = Buffer.byteLength(fixtureSource, 'utf8');
    const workdir = path.join(tmpBase, 'workdir');
    fs.mkdirSync(workdir, { recursive: true });

    const env = {
      ...process.env,
      SOURCE_BIN: sourceBin,
      WORKDIR: workdir,
      ENTRY_JS_OFFSET: String(entryJsOffset),
      ENTRY_END_OFFSET: String(entryEndOffset),
      CURRENT_CLAUDE_VERSION: '2.1.220',
      CLAUDE_TERMUX_PACKAGE_DIR: path.join(__dirname, '..'),
      MAGI_ENV: '1',
      CLAUDE_TERMUX_STDIN: 'inherit',
      CLAUDE_TERMUX_PRINT_WAIT_MS: '300',
      CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS: '10000',
      TMPDIR: tmpBase,
      TEST_SCENARIO: 'stream-json-result',
    };

    const start = Date.now();
    const result = child_process.spawnSync('sh', [scriptPath, '-p', 'x', '--output-format=stream-json'], {
      env,
      input: 'test input\n',
      encoding: 'utf8',
      timeout: 20000,
    });
    const elapsedMs = Date.now() - start;

    assert.equal(result.status, 0, `expected successful exit, got status=${result.status} stderr=${result.stderr}`);
    assert.ok(
      elapsedMs < 3000,
      `expected process to exit quickly after result detected, but elapsed=${elapsedMs}ms (should be < 3000ms with 10000ms timeout). This indicates the timeout timer was not cleared.`
    );
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('helper and bootstrap installStreamJsonTerminalWatcher helpers stay identical', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const bootstrapBlock = extractBlock('cat <<\'NODE\' > "$_bootstrap"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');

  const helperWatcher = extractFunction(
    helperBlock,
    'function installStreamJsonTerminalWatcher() {',
    '\n  function forceTimeoutExit',
  );
  const bootstrapWatcher = extractFunction(
    bootstrapBlock,
    'function installStreamJsonTerminalWatcher() {',
    '\n  function forceTimeoutExit',
  );

  assert.equal(helperWatcher, bootstrapWatcher, 'installStreamJsonTerminalWatcher must be identical in both heredocs');
});

test('helper and bootstrap installPlainTextWriteWatcher helpers stay identical', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const bootstrapBlock = extractBlock('cat <<\'NODE\' > "$_bootstrap"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');

  const extractFn = (block) => {
    const startMarker = 'function installPlainTextWriteWatcher() {';
    const start = block.indexOf(startMarker);
    assert.ok(start > -1, 'installPlainTextWriteWatcher function not found');
    let depth = 0;
    let i = start + startMarker.length - 1;
    for (; i < block.length; i++) {
      if (block[i] === '{') depth++;
      if (block[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    return block.slice(start, i + 1);
  };

  const helperFn = extractFn(helperBlock);
  const bootstrapFn = extractFn(bootstrapBlock);
  assert.equal(helperFn, bootstrapFn, 'installPlainTextWriteWatcher must be identical in helper and bootstrap');
});

test('helper and bootstrap forceTimeoutExit helpers stay identical', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const bootstrapBlock = extractBlock('cat <<\'NODE\' > "$_bootstrap"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');

  const helperForceExit = extractFunction(
    helperBlock,
    'function forceTimeoutExit(exitCode) {',
    '\n  async function waitForPrintFlush',
  );
  const bootstrapForceExit = extractFunction(
    bootstrapBlock,
    'function forceTimeoutExit(exitCode) {',
    '\n  async function waitForPrintFlushIfNeeded',
  );

  assert.equal(helperForceExit, bootstrapForceExit, 'forceTimeoutExit must be identical in both heredocs');
});

test('installStreamJsonTerminalWatcher restores process.stdout.write own property state', () => {
  // Test with the real process.stdout to verify own property handling
  const hadOwnPropertyBefore = Object.prototype.hasOwnProperty.call(process.stdout, 'write');
  const descriptorBefore = hadOwnPropertyBefore ? Object.getOwnPropertyDescriptor(process.stdout, 'write') : undefined;

  // Get the watcher function from helper
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const watcherSource = extractFunction(helperBlock, 'function installStreamJsonTerminalWatcher() {', '\n  function forceTimeoutExit');

  const context = vm.createContext({
    module: { exports: {} },
    process,
    Object,
    Buffer,
    require: (id) => {
      if (id === 'string_decoder') return require('string_decoder');
      throw new Error('require not available');
    },
  });

  vm.runInContext(`
    ${watcherSource}
    module.exports = installStreamJsonTerminalWatcher;
  `, context);

  const installStreamJsonTerminalWatcher = context.module.exports;

  try {
    // Test case 1: Normal case where write is not an own property
    {
      const watcher = installStreamJsonTerminalWatcher();
      const hadOwnPropertyAfterInstall = Object.prototype.hasOwnProperty.call(process.stdout, 'write');
      assert.equal(hadOwnPropertyAfterInstall, true, 'after install: process.stdout.write should be own property');

      // Restore watcher
      watcher.restore();
      const hadOwnPropertyAfterRestore = Object.prototype.hasOwnProperty.call(process.stdout, 'write');
      assert.equal(hadOwnPropertyAfterRestore, hadOwnPropertyBefore, 'after restore: own property state should match initial');

      // Verify restore is idempotent
      watcher.restore();
      const hadOwnPropertyAfterSecondRestore = Object.prototype.hasOwnProperty.call(process.stdout, 'write');
      assert.equal(hadOwnPropertyAfterSecondRestore, hadOwnPropertyBefore, 'second restore should also maintain initial state');
    }

    // Test case 2: When write is an own property before installation
    {
      const testDescriptor = {
        value: function testWrite() { return true; },
        writable: true,
        configurable: true,
        enumerable: false,
      };
      Object.defineProperty(process.stdout, 'write', testDescriptor);

      const watcher = installStreamJsonTerminalWatcher();
      const hadOwnAfterInstall = Object.prototype.hasOwnProperty.call(process.stdout, 'write');
      assert.equal(hadOwnAfterInstall, true, 'test case 2: after install should have own property');

      watcher.restore();
      const hadOwnAfterRestore = Object.prototype.hasOwnProperty.call(process.stdout, 'write');
      assert.equal(hadOwnAfterRestore, true, 'test case 2: after restore should still have own property');

      const restoredDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'write');
      assert.equal(typeof restoredDescriptor.value, 'function', 'test case 2: restored value should be a function');
      assert.equal(restoredDescriptor.configurable, true, 'test case 2: restored configurable should match');
    }
  } finally {
    // Ensure stdout.write is fully restored to original state
    if (hadOwnPropertyBefore && descriptorBefore) {
      Object.defineProperty(process.stdout, 'write', descriptorBefore);
    } else if (Object.prototype.hasOwnProperty.call(process.stdout, 'write')) {
      delete process.stdout.write;
    }
  }
});

test('helper branch stream-json result detection (single write)', () => {
  const r = runScenario({
    printMode: true,
    stdinInherit: false,
    scenario: 'stream-json-result',
    extraArgs: ['--output-format=stream-json'],
  });
  try {
    assert.equal(r.status, 0, `expected status 0, got ${r.status}; stderr=${r.stderr}`);
    // Result detection should be significantly faster than traditional PRINT_WAIT_MS (300ms in tests)
    assert.ok(r.elapsedMs < 1500, `expected completion < 1500ms (much faster than 300ms PRINT_WAIT_MS), got ${r.elapsedMs}ms`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('bootstrap branch stream-json result detection (single write)', () => {
  const r = runScenario({
    printMode: true,
    stdinInherit: true,
    scenario: 'stream-json-result',
    extraArgs: ['--output-format=stream-json'],
  });
  try {
    assert.equal(r.status, 0, `expected status 0, got ${r.status}; stderr=${r.stderr}`);
    // Result detection should be significantly faster than traditional PRINT_WAIT_MS (300ms in tests)
    assert.ok(r.elapsedMs < 1500, `expected completion < 1500ms (much faster than 300ms PRINT_WAIT_MS), got ${r.elapsedMs}ms`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('helper branch stream-json multibyte character split handling', () => {
  const r = runScenario({
    printMode: true,
    stdinInherit: false,
    scenario: 'stream-json-multibyte-split',
    extraArgs: ['--output-format=stream-json'],
  });
  try {
    assert.equal(r.status, 0, `expected status 0, got ${r.status}; stderr=${r.stderr}`);
    assert.ok(r.elapsedMs < 6000, `expected completion < 6000ms, got ${r.elapsedMs}ms`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('bootstrap branch stream-json multibyte character split handling', () => {
  const r = runScenario({
    printMode: true,
    stdinInherit: true,
    scenario: 'stream-json-multibyte-split',
    extraArgs: ['--output-format=stream-json'],
  });
  try {
    assert.equal(r.status, 0, `expected status 0, got ${r.status}; stderr=${r.stderr}`);
    assert.ok(r.elapsedMs < 6000, `expected completion < 6000ms, got ${r.elapsedMs}ms`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('helper branch stream-json timeout triggers exit with status 1', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-stream-timeout-'));
  try {
    const sourceBin = path.join(tmpBase, 'fake-source.js');
    const fixtureSource = buildScenarioFixtureSource();
    fs.writeFileSync(sourceBin, fixtureSource, 'utf8');
    const entryJsOffset = 0;
    const entryEndOffset = Buffer.byteLength(fixtureSource, 'utf8');
    const workdir = path.join(tmpBase, 'workdir');
    fs.mkdirSync(workdir, { recursive: true });

    const env = {
      ...process.env,
      SOURCE_BIN: sourceBin,
      WORKDIR: workdir,
      ENTRY_JS_OFFSET: String(entryJsOffset),
      ENTRY_END_OFFSET: String(entryEndOffset),
      CURRENT_CLAUDE_VERSION: '2.1.220',
      CLAUDE_TERMUX_PACKAGE_DIR: path.join(__dirname, '..'),
      MAGI_ENV: '1',
      CLAUDE_TERMUX_PRINT_WAIT_MS: '300',
      CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS: '300',
      TMPDIR: tmpBase,
      TEST_SCENARIO: 'stream-json-timeout',
    };
    delete env.CLAUDE_TERMUX_STDIN;

    const result = child_process.spawnSync('sh', [scriptPath, '-p', 'x', '--output-format=stream-json'], {
      env,
      input: 'test input\n',
      encoding: 'utf8',
      timeout: 5000,
    });

    assert.equal(result.status, 1, `expected status 1 on timeout, got ${result.status}; stderr=${result.stderr}`);
    const entries = fs.readdirSync(workdir, { withFileTypes: true });
    const entryFiles = entries.filter(e => e.name.includes('cli.') && e.name.endsWith('.bare-path.js'));
    assert.equal(entryFiles.length, 0, `expected no extracted entry files after timeout, found ${entryFiles.length}`);
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('bootstrap branch stream-json timeout triggers exit with status 1', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-stream-timeout-'));
  try {
    const sourceBin = path.join(tmpBase, 'fake-source.js');
    const fixtureSource = buildScenarioFixtureSource();
    fs.writeFileSync(sourceBin, fixtureSource, 'utf8');
    const entryJsOffset = 0;
    const entryEndOffset = Buffer.byteLength(fixtureSource, 'utf8');
    const workdir = path.join(tmpBase, 'workdir');
    fs.mkdirSync(workdir, { recursive: true });

    const env = {
      ...process.env,
      SOURCE_BIN: sourceBin,
      WORKDIR: workdir,
      ENTRY_JS_OFFSET: String(entryJsOffset),
      ENTRY_END_OFFSET: String(entryEndOffset),
      CURRENT_CLAUDE_VERSION: '2.1.220',
      CLAUDE_TERMUX_PACKAGE_DIR: path.join(__dirname, '..'),
      MAGI_ENV: '1',
      CLAUDE_TERMUX_PRINT_WAIT_MS: '300',
      CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS: '300',
      CLAUDE_TERMUX_STDIN: 'inherit',
      TMPDIR: tmpBase,
      TEST_SCENARIO: 'stream-json-timeout',
    };

    const result = child_process.spawnSync('sh', [scriptPath, '-p', 'x', '--output-format=stream-json'], {
      env,
      input: 'test input\n',
      encoding: 'utf8',
      timeout: 5000,
    });

    assert.equal(result.status, 1, `expected status 1 on timeout, got ${result.status}; stderr=${result.stderr}`);
    const entries = fs.readdirSync(workdir, { withFileTypes: true });
    const entryFiles = entries.filter(e => e.name.includes('cli.') && e.name.endsWith('.bare-path.js'));
    assert.equal(entryFiles.length, 0, `expected no extracted entry files after timeout, found ${entryFiles.length}`);
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('helper branch stream-json requested exit after result', () => {
  const r = runScenario({
    printMode: true,
    stdinInherit: false,
    scenario: 'stream-json-requested-exit-then-result',
    extraArgs: ['--output-format=stream-json'],
  });
  try {
    assert.equal(r.status, 0, `expected status 0, got ${r.status}; stderr=${r.stderr}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('bootstrap branch stream-json requested exit after result', () => {
  const r = runScenario({
    printMode: true,
    stdinInherit: true,
    scenario: 'stream-json-requested-exit-then-result',
    extraArgs: ['--output-format=stream-json'],
  });
  try {
    assert.equal(r.status, 0, `expected status 0, got ${r.status}; stderr=${r.stderr}`);
  } finally {
    fs.rmSync(r.tmpBase, { recursive: true, force: true });
  }
});

test('installStreamJsonTerminalWatcher waits for write callback before completing result', async () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const watcherSource = extractFunction(helperBlock, 'function installStreamJsonTerminalWatcher() {', '\n  function forceTimeoutExit');

  // Create a dedicated mock stdout object instead of modifying the real one
  let callbackFired = false;
  const mockStdout = Object.create(Object.getPrototypeOf(process.stdout));

  // Copy necessary properties
  Object.defineProperty(mockStdout, 'write', {
    value: function(chunk, encoding, callback) {
      if (typeof encoding === 'function') {
        callback = encoding;
        encoding = undefined;
      }
      if (callback) {
        // Defer callback to next microtask
        setImmediate(() => {
          callbackFired = true;
          callback();
        });
      }
      return true;
    },
    writable: true,
    configurable: true,
  });

  const context = vm.createContext({
    module: { exports: {} },
    process: { stdout: mockStdout },
    Object,
    Buffer,
    require: (id) => {
      if (id === 'string_decoder') return require('string_decoder');
      throw new Error('require not available');
    },
  });

  vm.runInContext(`
    ${watcherSource}
    module.exports = installStreamJsonTerminalWatcher;
  `, context);

  const installStreamJsonTerminalWatcher = context.module.exports;
  const watcher = installStreamJsonTerminalWatcher();

  // Simulate a write with result JSON
  const resultJson = '{"type":"result","data":"test"}\n';
  mockStdout.write(resultJson, 'utf8');

  // Get the promise before callback fires
  const resultPromise = watcher.waitForResult();

  // Give time for callback to fire
  await new Promise(resolve => setTimeout(resolve, 50));

  // Promise should now be resolved
  await resultPromise;
  assert.ok(callbackFired, 'callback should have been fired');

  watcher.restore();
});

function extractShimSource(block) {
  const startMarker = 'const _realChild = require(\'child_process\');';
  const endMarker = 'Object.assign(globalThis.__claudeBunShim, globalThis.Bun);';
  const start = block.indexOf(startMarker);
  assert.notEqual(start, -1, 'missing Bun shim start');
  const end = block.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'missing Bun shim end');
  return block.slice(start, end + endMarker.length);
}

function loadBunShim(source) {
  const context = vm.createContext({
    stringWidth: () => 0,
    wrapAnsi: value => value,
    stripANSI: value => value,
    stableHash: () => 0,
    __claudeYaml: {},
    Buffer,
    require,
  });
  context.__claudeBunShim = {};
  context.__claudeYaml = {};
  context.Bun = {};
  context.module = { exports: {} };
  vm.runInContext(`${source}\nmodule.exports = globalThis.__claudeBunShim;`, context);
  return context.module.exports;
}

test('helper and bootstrap Bun shim source is identical', () => {
  const helperBlock = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const bootstrapBlock = extractBlock('cat <<\'NODE\' > "$_bootstrap"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  assert.equal(extractShimSource(helperBlock), extractShimSource(bootstrapBlock));
});

test('Bun.file always throws ENOENT', () => {
  for (const blockMarker of ['cat <<\'NODE\' > "$_helper"', 'cat <<\'NODE\' > "$_bootstrap"']) {
    const block = extractBlock(blockMarker, '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
    const Bun = loadBunShim(extractShimSource(block));
    assert.throws(() => Bun.file('/some/path'), error =>
      error.code === 'ENOENT' && error.errno === -2);
  }
});

test('Bun.spawn supports top-level and array stdio forms', async () => {
  const block = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const Bun = loadBunShim(extractShimSource(block));
  const topLevel = Bun.spawn(['echo', 'hello'], { stdout: 'pipe', stderr: 'ignore' });
  assert.equal(await topLevel.stdout.text(), 'hello\n');
  assert.equal(await topLevel.exited, 0);
  const arrayForm = Bun.spawn(['echo', 'hello'], { stdio: ['ignore', 'pipe', 'ignore'] });
  assert.equal(await arrayForm.stdout.text(), 'hello\n');
  assert.equal(await arrayForm.exited, 0);
});

test('Bun.spawn forwards options, preserves numeric fds, and delegates child controls', () => {
  const block = extractBlock('cat <<\'NODE\' > "$_helper"', '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
  const calls = [];
  const handlers = {};
  const child = {
    pid: 123,
    stdout: null,
    on(event, handler) { handlers[event] = handler; return this; },
    unref() { calls.push(['unref']); },
    kill(signal) { calls.push(['kill', signal]); },
  };
  mock.method(child_process, 'spawn', (...args) => {
    calls.push(args);
    return child;
  });
  try {
    const Bun = loadBunShim(extractShimSource(block));
    const result = Bun.spawn(['cmd', 'arg'], {
      detached: true,
      argv0: 'argv0-value',
      cwd: '/tmp/work',
      env: { TEST: 'yes' },
      stdio: [0, 1, 2],
    });
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), [
      'cmd',
      ['arg'],
      {
        stdio: [0, 1, 2],
        cwd: '/tmp/work',
        env: { TEST: 'yes' },
        detached: true,
        argv0: 'argv0-value',
      },
    ]);
    result.unref();
    result.kill('SIGTERM');
    assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(1))), [['unref'], ['kill', 'SIGTERM']]);
  } finally {
    mock.restoreAll();
  }
});

test('Bun.spawn prefers stdio array over top-level stdio options', () => {
  for (const blockMarker of ['cat <<\'NODE\' > "$_helper"', 'cat <<\'NODE\' > "$_bootstrap"']) {
    const block = extractBlock(blockMarker, '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
    const calls = [];
    mock.method(child_process, 'spawn', (...args) => {
      calls.push(args);
      return { pid: 123, stdout: null, on() { return this; } };
    });
    try {
      const Bun = loadBunShim(extractShimSource(block));
      Bun.spawn(['cmd'], {
        stdio: [0, 1, 2],
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      });
      assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])), {
        stdio: [0, 1, 2],
        detached: false,
      });
    } finally {
      mock.restoreAll();
    }
  }
});

test('Bun.spawn forwards top-level stdin in the first stdio position', () => {
  for (const blockMarker of ['cat <<\'NODE\' > "$_helper"', 'cat <<\'NODE\' > "$_bootstrap"']) {
    const block = extractBlock(blockMarker, '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
    const calls = [];
    mock.method(child_process, 'spawn', (...args) => {
      calls.push(args);
      return { pid: 123, stdout: null, on() { return this; } };
    });
    try {
      const Bun = loadBunShim(extractShimSource(block));
      Bun.spawn(['cmd'], { stdin: 'inherit', stdout: 'pipe', stderr: 'ignore' });
      assert.equal(calls[0][2].stdio[0], 'inherit');
      assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2].stdio)), ['inherit', 'pipe', 'ignore']);
    } finally {
      mock.restoreAll();
    }
  }
});
