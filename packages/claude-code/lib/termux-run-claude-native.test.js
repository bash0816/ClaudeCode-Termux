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
    sliceAnsi: (s) => s,
    sleepSync: () => {},
    CellSegmenter: class {},
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

function extractEsmShimSource(block) {
  const startMarker = '\n  globalThis.Bun = {';
  const endMarker = '\n  globalThis.__claudeBun = globalThis.Bun;';
  const start = block.indexOf(startMarker);
  assert.notEqual(start, -1, 'missing ESM Bun shim start');
  const end = block.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'missing ESM Bun shim end');
  return block.slice(start + 1, end + endMarker.length);
}

function loadEsmBunShim(source) {
  const context = vm.createContext({
    stringWidth: () => 0,
    wrapAnsi: value => value,
    stripANSI: value => value,
    stableHash: () => 0,
    sliceAnsi: (s) => s,
    sleepSync: () => {},
    CellSegmenter: class {},
    process: { versions: {} },
    Buffer,
    require,
  });
  context.module = { exports: {} };
  vm.runInContext(`${source}\nmodule.exports = globalThis.Bun;`, context);
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

// New tests for fs interception and zstd support

// esmChunkedMain() (esm-chunked 形式、今回の fs-intercept 修正の対象) の関数本体だけを抽出する。
// legacyCjsMain() の Bun shim (zstd 非対応でよい、意図的に無変更) を誤って対象に含めないため、
// 「both esmChunkedMain blocks have correct hook registration order」テストと同じ境界抽出方式を使う。
function extractEsmChunkedMainBlocks() {
  const marker = 'async function esmChunkedMain()';
  const blocks = [];
  let offset = 0;
  while ((offset = script.indexOf(marker, offset)) !== -1) {
    const blockStart = offset;
    const blockEnd = script.indexOf('\nasync function', offset + 1);
    const actualBlockEnd = blockEnd !== -1 ? blockEnd : script.length;
    blocks.push(script.slice(blockStart, actualBlockEnd));
    offset = actualBlockEnd;
  }
  return blocks;
}

test('both esmChunkedMain Bun shim blocks contain zstdDecompressSync and zstdDecompress fields', () => {
  const blocks = extractEsmChunkedMainBlocks();
  assert.ok(blocks.length >= 2, 'should have at least 2 esmChunkedMain blocks (helper and bootstrap)');

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    assert.ok(
      block.includes('zstdDecompressSync:'),
      `Block ${i}: missing zstdDecompressSync field`,
    );
    assert.ok(
      block.includes('zstdDecompress:'),
      `Block ${i}: missing zstdDecompress field`,
    );
  }
});

test('zstd functions are properly defined for sync decompression', () => {
  const blocks = extractEsmChunkedMainBlocks();
  assert.ok(blocks.length >= 1, 'should have at least 1 esmChunkedMain block');

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const syncMatch = block.match(/zstdDecompressSync:\s*\([^)]*\)\s*=>\s*require\('node:zlib'\)\.zstdDecompressSync\([^)]*\)/);
    assert.ok(syncMatch, `Block ${i}: zstdDecompressSync should call require("node:zlib").zstdDecompressSync`);

    const asyncMatch = block.match(/zstdDecompress:\s*\([^)]*\)\s*=>\s*new Promise/);
    assert.ok(asyncMatch, `Block ${i}: zstdDecompress should return a Promise`);
  }
});

test('zstd decompression works with real zlib.zstd APIs', async () => {
  const zlib = require('node:zlib');

  // Skip if zstd not available
  if (typeof zlib.zstdCompressSync !== 'function') {
    return;
  }

  const testData = Buffer.from('Hello, compression world!');
  const compressed = zlib.zstdCompressSync(testData);

  // Test sync decompression
  const decompressedSync = zlib.zstdDecompressSync(compressed);
  assert.deepEqual(decompressedSync, testData);

  // Test async decompression
  const decompressedAsync = await new Promise((resolve, reject) => {
    zlib.zstdDecompress(compressed, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
  assert.deepEqual(decompressedAsync, testData);
});

test('both esmChunkedMain blocks have correct hook registration order', () => {
  const esmChunkedMarker = 'async function esmChunkedMain()';
  let blockCount = 0;
  let offset = 0;

  while ((offset = script.indexOf(esmChunkedMarker, offset)) !== -1) {
    blockCount++;
    const blockStart = offset;
    const blockEnd = script.indexOf('\nasync function', offset + 1);
    const actualBlockEnd = blockEnd !== -1 ? blockEnd : script.length;
    const block = script.slice(blockStart, actualBlockEnd);

    // Find the three key operations
    const initIdx = block.indexOf('loaderMod.initialize({');
    const interceptIdx = block.indexOf('loaderMod.installFsBunfsInterception()');
    const registerIdx = block.indexOf('registerHooks({');

    assert.ok(initIdx !== -1, `Block ${blockCount}: missing initialize call`);
    assert.ok(interceptIdx !== -1, `Block ${blockCount}: missing installFsBunfsInterception call`);
    assert.ok(registerIdx !== -1, `Block ${blockCount}: missing registerHooks call`);

    // Verify order: initialize < installFsBunfsInterception < registerHooks
    assert.ok(
      initIdx < interceptIdx && interceptIdx < registerIdx,
      `Block ${blockCount}: initialization order incorrect (initialize=${initIdx}, intercept=${interceptIdx}, register=${registerIdx})`,
    );

    offset = actualBlockEnd;
  }

  assert.ok(blockCount >= 2, 'should have at least 2 esmChunkedMain blocks');
});

test('ESM Bun shim exposes unsafe.setJITPolicy as a safe no-op (helper/bootstrap)', () => {
  for (const blockMarker of ['cat <<\'NODE\' > "$_helper"', 'cat <<\'NODE\' > "$_bootstrap"']) {
    const block = extractBlock(blockMarker, '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
    const Bun = loadEsmBunShim(extractEsmShimSource(block));
    assert.equal(Bun.unsafe.setJITPolicy(1), undefined);
  }
});

test('legacy Bun shim exposes unsafe.setJITPolicy as a safe no-op (helper/bootstrap)', () => {
  for (const blockMarker of ['cat <<\'NODE\' > "$_helper"', 'cat <<\'NODE\' > "$_bootstrap"']) {
    const block = extractBlock(blockMarker, '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
    const Bun = loadBunShim(extractShimSource(block));
    assert.equal(Bun.unsafe.setJITPolicy(1), undefined);
  }
});

test('termux-run-claude-native.sh maintains compatibility with new zstd fields', () => {
  // Verify that the script structure is preserved
  const hasSourceBin = script.includes('SOURCE_BIN=');
  const hasWorkdir = script.includes('WORKDIR=');
  const hasGlobalThis = script.includes('globalThis');

  assert.ok(hasSourceBin, 'script should set SOURCE_BIN');
  assert.ok(hasWorkdir, 'script should set WORKDIR');
  assert.ok(hasGlobalThis, 'script should manipulate globalThis');

  // Verify both blocks exist and are distinct
  const blocks = (script.match(/globalThis\.Bun\s*=\s*{/g) || []);
  assert.ok(blocks.length >= 2, 'should have at least 2 Bun initializations for helper and bootstrap');
});

test('ESM and legacy Bun shims include new CellSegmenter exports', () => {
  for (const blockMarker of ['cat <<\'NODE\' > "$_helper"', 'cat <<\'NODE\' > "$_bootstrap"']) {
    const block = extractBlock(blockMarker, '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
    const BunEsm = loadEsmBunShim(extractEsmShimSource(block));
    const BunLegacy = loadBunShim(extractShimSource(block));

    // Verify sliceAnsi is present
    assert.equal(typeof BunEsm.sliceAnsi, 'function', `${blockMarker}: ESM sliceAnsi should be a function`);
    assert.equal(typeof BunLegacy.sliceAnsi, 'function', `${blockMarker}: legacy sliceAnsi should be a function`);

    // Verify sleepSync is present
    assert.equal(typeof BunEsm.sleepSync, 'function', `${blockMarker}: ESM sleepSync should be a function`);
    assert.equal(typeof BunLegacy.sleepSync, 'function', `${blockMarker}: legacy sleepSync should be a function`);


    // Verify CellSegmenter is present
    assert.equal(typeof BunEsm.ant.CellSegmenter, 'function', `${blockMarker}: ESM ant.CellSegmenter should be a function`);
    assert.equal(typeof BunLegacy.ant.CellSegmenter, 'function', `${blockMarker}: legacy ant.CellSegmenter should be a function`);
  }
});

// ============================================================
// CellSegmenter integration tests with vendor harness (G3 v2 revision)
// ============================================================

test('CellSegmenter: run monotonicity and style non-contamination (BL-3)', () => {
  const createHarness = require('./test-support/vendor-cellsegmenter-harness.js');
  const h = createHarness((s) => s.replace(/\x1b\[[0-9;]*m/g, '').length, (s) => 1);
  const { D, Pool } = h;

  const stylePool = new Pool();
  const charPool = new Pool([' ', 'S']);
  const hyperPool = new Pool(['']);

  // Test case: style repeats after gap (BL-3 regression)
  const d1 = new D(stylePool, charPool);
  d1.segment('aa\x1b[34mBLUE\x1b[39m', false);
  d1.paint(h.mkScreen(40, 1).cells, 40, 0, 0, hyperPool);

  const d2 = new D(stylePool, charPool);
  const n = d2.segment('ok \x1b[1mERR\x1b[22m done', false);

  // Verify run indices are monotonic
  const runIndices = [];
  for (let i = 0; i < n; i++) {
    runIndices.push(d2.cells[2*i+1] >>> 10);
  }
  for (let i = 1; i < runIndices.length; i++) {
    assert.ok(runIndices[i] >= runIndices[i-1], `run ${i} should be >= run ${i-1}`);
  }

  // Paint and verify style isolation (find the bold run, not run 0)
  d2.paint(h.mkScreen(40, 1).cells, 40, 0, 0, hyperPool);
  const boldRunIdx = runIndices.find(r => r > 0) || 0;  // Skip run 0 (unstyled)
  const boldStyleId = d2.styleId(d2.runs[2*boldRunIdx]);
  const blueStyleId = stylePool.arr.findIndex(s => s.includes('34'));
  assert.ok(boldStyleId !== blueStyleId || blueStyleId === -1, 'style should not contaminate between segments');
});

test('CellSegmenter: foreground color exclusivity (BL-6)', () => {
  const createHarness = require('./test-support/vendor-cellsegmenter-harness.js');
  const h = createHarness((s) => s.replace(/\x1b\[[0-9;]*m/g, '').length, (s) => 1);
  const { D, Pool } = h;

  const stylePool = new Pool();
  const charPool = new Pool([' ', 'S']);
  const d = new D(stylePool, charPool);

  const text = '\x1b[31mRED\x1b[32mGREEN\x1b[0m';
  d.segment(text, false);

  // Extract runIndices for RED and GREEN
  const reds = [];
  const greens = [];
  for (let i = 0; i < d.count; i++) {
    const runIdx = d.cells[2*i+1] >>> 10;
    if (d.graphemes[d.cells[2*i]] === 'R') reds.push(runIdx);
    if (d.graphemes[d.cells[2*i]] === 'G') greens.push(runIdx);
  }

  const redStyleId = reds.length > 0 ? d.styleId(d.runs[2*reds[0]]) : -1;
  const greenStyleId = greens.length > 0 ? d.styleId(d.runs[2*greens[0]]) : -1;
  assert.notEqual(redStyleId, greenStyleId, 'RED and GREEN should have distinct styleIds');

  // Direct validation: GREEN run should NOT contain red (31) code - verifying exclusivity
  if (greens.length > 0) {
    const greenRunIdx = greens[0];
    const greenSgrIdx = d.runs[2*greenRunIdx];
    const greenCodes = d.ansiCodes(greenSgrIdx);
    const hasBothColors = greenCodes.some(c => c.code.includes('31')) && greenCodes.some(c => c.code.includes('32'));
    assert.ok(!hasBothColors, 'GREEN run should not contain red (31) code - colors must be exclusive');
  }
});

test('CellSegmenter: sgrCloseKeys derivation (§9-5)', () => {
  const createHarness = require('./test-support/vendor-cellsegmenter-harness.js');
  const h = createHarness((s) => s.replace(/\x1b\[[0-9;]*m/g, '').length, (s) => 1);
  const { D, Pool, mC } = h;

  const stylePool = new Pool();
  const charPool = new Pool([' ', 'S']);
  const d = new D(stylePool, charPool);

  const text = '\x1b[1;31mX';
  d.segment(text, false);

  // Check that sgrKeys[1] contains open codes and sgrCloseKeys[1] contains matching close codes
  const keys = d.sgrKeys[1];
  const closeKeys = d.sgrCloseKeys[1];
  const keyList = keys.split('\x00').filter(k => k);
  const closeList = closeKeys.split('\x00').filter(k => k);

  assert.equal(keyList.length, closeList.length, 'open and close codes should have same count');
  assert.ok(keyList.some(k => k.includes('1')), 'should have bold (1)');
  assert.ok(keyList.some(k => k.includes('31')), 'should have fg-red (31)');
  assert.ok(closeList.some(c => c.includes('22')), 'should have bold-close (22)');
  assert.ok(closeList.some(c => c.includes('39')), 'should have fg-close (39)');
});

test('CellSegmenter: URI indexing and OSC8 handling (BL-4, BL-5)', () => {
  const createHarness = require('./test-support/vendor-cellsegmenter-harness.js');
  const h = createHarness((s) => s.replace(/\x1b\[[0-9;]*m/g, '').length, (s) => 1);
  const { D, Pool, mkScreen, readCell } = h;

  const stylePool = new Pool();
  const charPool = new Pool([' ', 'S']);
  const hyperPool = new Pool(['']);
  const d = new D(stylePool, charPool);

  // Test OSC8 with BEL terminator
  const text1 = 'A\x1b]8;;http://x\x07B\x1b]8;;\x07C';
  d.segment(text1, false);
  const screen1 = mkScreen(40, 1);
  d.paint(screen1.cells, 40, 0, 0, hyperPool);

  const cellA = readCell(screen1, charPool, hyperPool, 0, 0);
  const cellB = readCell(screen1, charPool, hyperPool, 1, 0);
  const cellC = readCell(screen1, charPool, hyperPool, 2, 0);

  assert.equal(cellA.hyperlink, undefined, 'A should have no hyperlink');
  assert.equal(cellB.hyperlink, 'http://x', 'B should link to http://x');
  assert.equal(cellC.hyperlink, undefined, 'C should have no hyperlink');

  // Test OSC8 with ST terminator (ESC backslash)
  stylePool.arr = [];
  stylePool.map.clear();
  const d2 = new D(stylePool, charPool);
  const text2 = '\x1b]8;;http://st\x1b\\ST\x1b]8;;\x1b\\';
  d2.segment(text2, false);

  // Verify no ESC byte mixed into text
  const textReconstructed = d2.graphemes.slice(0, d2.count).join('');
  assert.equal(textReconstructed, 'ST', 'ST terminator should not include ESC bytes');

  // BL-5: Verify uris array has clean URLs without ESC bytes
  const uriWithoutEsc = d2.uris[1];  // Index 1 because 0 is reserved
  assert.ok(uriWithoutEsc, 'should have URI at index 1');
  assert.equal(uriWithoutEsc, 'http://st', 'URI should be clean without ESC bytes');
});

test('CellSegmenter: no infinite loops on malformed escapes (BL-1, BL-2)', function() {
  const createShim = require('./bun-cellsegmenter-shim.js');
  const { CellSegmenter, sliceAnsi } = createShim({
    stringWidth: (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length,
    graphemeWidth: (s) => 1
  });

  const cases = {
    'osc-title': '\x1b]0;my title\x07hello',
    'osc9': '\x1b]9;notify\x07hi',
    'osc8-badprefix': '\x1b]8x;;http://a\x07hi',
    'esc-alone': 'abc\x1b',
    'esc-paren': 'abc\x1bcdef',
    'esc-dcs': '\x1bPsomething\x1b\\text',
    'esc-st': 'a\x1b\\b',
    'esc-charset': '\x1b(Bhello',
    'esc-esc': 'a\x1b\x1bb',
    'sgr-unterm': 'abc\x1b[31',
    'osc8-unterm': 'abc\x1b]8;;http://x',
    'csi-K': '\x1b[Khello, my friend',
    'csi-cursor': '\x1b[2J\x1b[Hmenu item',
  };

  const seg = new CellSegmenter({
    ambiguousIsNarrow: true,
    substitute: [],
    screen: { widthMask: 3, narrow: 0, wide: 1, spacerTail: 2, spacerHead: 3, emptyCharIndex: 0, spacerCharIndex: 1, emptyWord: 0, tabWidth: 8 }
  });

  for (const [label, text] of Object.entries(cases)) {
    // Test segment() with timeout
    const startSeg = Date.now();
    const n = seg.segment(text, new Int32Array(1024), new Int32Array(1024), false);
    const segTime = Date.now() - startSeg;
    assert.ok(segTime < 500, `segment(${label}) took ${segTime}ms (>500ms suggests hang)`);
    assert.ok(n >= 0 || n === -1, `segment(${label}) returned invalid result ${n}`);

    // Test sliceAnsi() with timeout
    const startSlice = Date.now();
    const result = sliceAnsi(text, 0, 100);
    const sliceTime = Date.now() - startSlice;
    assert.ok(sliceTime < 500, `sliceAnsi(${label}) took ${sliceTime}ms (>500ms suggests hang)`);

    // Verify CSI sequences are consumed (not in output text)
    if (label === 'csi-K') {
      assert.equal(result, 'hello, my friend', 'CSI-K should consume and not appear in output');
    }
    if (label === 'csi-cursor') {
      assert.equal(result, 'menu item', 'CSI-2J and CSI-H should not appear in output');
    }
  }
});

test('CellSegmenter: grapheme boundary correctness (BL-8 regression prevention)', () => {
  const createHarness = require('./test-support/vendor-cellsegmenter-harness.js');
  const h = createHarness((s) => s.replace(/\x1b\[[0-9;]*m/g, '').length, (s) => {
    // Proper grapheme width calculation
    const symbols = Array.from(String(s || ''));
    const codePoints = symbols.map(sym => sym.codePointAt(0)).filter(cp => Number.isFinite(cp));
    if (codePoints.length === 0) return 0;
    if (codePoints.length > 1 && codePoints.every(cp => cp >= 0x1f1e6 && cp <= 0x1f1ff)) return 2;  // Flag pairs
    if (codePoints.includes(0x200d) || codePoints.includes(0x20e3) || codePoints.includes(0xfe0f)) return 2;  // ZWJ, VS16
    if (codePoints.some(cp => (cp >= 0x1f300 && cp <= 0x1f6ff) || (cp >= 0x1f900 && cp <= 0x1f9ff))) return 2;  // Emoji
    return 1;
  });
  const { D, Pool } = h;

  const stylePool = new Pool();
  const charPool = new Pool([' ', 'S']);

  // Test 1: ZWJ family emoji (👨‍👩‍👧) should be 1 grapheme, not split
  const d1 = new D(stylePool, charPool);
  const family = '👨‍👩‍👧';
  const n1 = d1.segment(family, false);
  assert.equal(n1, 1, `Family emoji ${JSON.stringify(family)} should be 1 grapheme cluster`);

  // Test 2: Flag emoji (🇯🇵) should be 1 grapheme (surrogate pair combined)
  const d2 = new D(stylePool, charPool);
  const jpFlag = '🇯🇵';
  const n2 = d2.segment(jpFlag, false);
  assert.equal(n2, 1, `Flag emoji ${JSON.stringify(jpFlag)} should be 1 grapheme cluster`);

  // Test 3: sliceAnsi() should not produce isolated surrogates
  const { sliceAnsi } = h;
  const sliceResult = sliceAnsi('a👍b', 0, 2);
  // Check for isolated surrogates (UTF-16 range 0xD800-0xDFFF)
  const isSurrogatePair = /[\ud800-\udfff]/.test(sliceResult);
  assert.ok(!isSurrogatePair, `sliceAnsi('a👍b', 0, 2) should not have orphaned surrogates: ${JSON.stringify(sliceResult)}`);

  // Test 4: Warning symbol with VS16 (⚠️) should have correct width
  const d4 = new D(stylePool, charPool);
  const warning = '⚠️ warn';
  const n4 = d4.segment(warning, false);
  // Intl.Segmenter splits as: '⚠️' (1 grapheme) + ' ' (1) + 'w' (1) + 'a' (1) + 'r' (1) + 'n' (1) = 6 graphemes
  assert.equal(n4, 6, `Warning symbol with VS16 should produce 6 graphemes: got ${n4}`);
});

test('CellSegmenter: fresh instance pool initialization (NB-2)', () => {
  const createHarness = require('./test-support/vendor-cellsegmenter-harness.js');
  const h = createHarness((s) => s.replace(/\x1b\[[0-9;]*m/g, '').length, (s) => {
    // Simple width calculator
    const codePoints = Array.from(String(s || '')).map(sym => sym.codePointAt(0)).filter(cp => Number.isFinite(cp));
    if (codePoints.length === 0) return 0;
    if (codePoints.length > 1 && codePoints.every(cp => cp >= 0x1f1e6 && cp <= 0x1f1ff)) return 2;  // Flag pairs
    if (codePoints.includes(0x200d) || codePoints.includes(0x20e3) || codePoints.includes(0xfe0f)) return 2;  // ZWJ, VS16
    return 1;
  });
  const { D, Pool } = h;

  // Test 1: New instance pool initialization
  const stylePool = new Pool();
  const charPool = new Pool([' ', 'a', 'b', 'c']);
  const d = new D(stylePool, charPool);

  // Verify initial pool state: sgrKeys should have [''] (index 0 only)
  assert.equal(d.sgrKeys.length, 1, 'sgrKeys should start with length 1 (index 0 only)');
  assert.equal(d.sgrKeys[0], '', 'sgrKeys[0] should be empty string');

  // Verify initial pool state: uris should have [''] (index 0 only)
  assert.equal(d.uris.length, 1, 'uris should start with length 1 (index 0 only)');
  assert.equal(d.uris[0], '', 'uris[0] should be empty string');

  // Test 2: Multiple segments work correctly without reset
  d.segment('hello world', false);
  d.segment('test string', false);
  assert.ok(d.sgrKeys.length >= 1, 'sgrKeys should grow or stay at 1 (unstyled input)');
  assert.ok(d.graphemes.length >= 20, 'graphemes should accumulate');

  // Test 3: Fresh instance has clean pools
  const d2 = new D(stylePool, charPool);
  assert.equal(d2.sgrKeys.length, 1, 'new instance sgrKeys should be at length 1');
  assert.equal(d2.sgrKeys[0], '', 'new instance sgrKeys[0] should be empty string');
  assert.equal(d2.uris.length, 1, 'new instance uris should be at length 1');
  assert.equal(d2.uris[0], '', 'new instance uris[0] should be empty string');

  // Test 4: Fresh instance can segment immediately
  const count2 = d2.segment('fresh test', false);
  assert.ok(count2 > 0, 'should successfully segment after reset');
  assert.equal(d2.graphemes.length, count2, 'grapheme count should match segment result');
});

test('stableHash.xxHash64 implementation (G2 v3 implementation)', () => {
  const api = loadHelperApi();
  const { stableHash } = api;

  // Test 1: Base64 representation of xxHash64 result is valid (1-13 chars in base36)
  const result1 = stableHash.xxHash64('x').toString(36);
  assert.match(result1, /^[0-9a-z]{1,13}$/, `xxHash64('x').toString(36) should match [0-9a-z]{1,13}, got: ${result1}`);

  // Test 2: seedless mode with fixed literal values - hi !== lo
  const fixedLiterals = ['a', 'hello', 'thinking:1562789', 'thinking:1779192', '', 'x'.repeat(100)];
  for (const val of fixedLiterals) {
    const h = stableHash.xxHash64(val);
    const hi = h >> 32n;
    const lo = h & 0xffffffffn;
    assert.ok(hi !== lo, `xxHash64('${val.slice(0, 20)}${val.length > 20 ? '...' : ''}') should have hi !== lo (got hi=${hi}, lo=${lo})`);
  }

  // Test 3: seed specified mode - hi !== lo
  const seededPairs = [
    ['x', 42],
    ['hello', 1234],
    ['test', 9999],
  ];
  for (const [val, seed] of seededPairs) {
    const h = stableHash.xxHash64(val, seed);
    const hi = h >> 32n;
    const lo = h & 0xffffffffn;
    assert.ok(hi !== lo, `xxHash64('${val}', ${seed}) should have hi !== lo (got hi=${hi}, lo=${lo})`);
  }

  // Test 4: Deterministic (repeated calls return same result)
  const val = 'determinism-test';
  const r1 = stableHash.xxHash64(val);
  const r2 = stableHash.xxHash64(val);
  const r3 = stableHash.xxHash64(val);
  assert.equal(r1, r2, `xxHash64 should be deterministic (1st vs 2nd call)`);
  assert.equal(r2, r3, `xxHash64 should be deterministic (2nd vs 3rd call)`);

  // Test 5: Return type is bigint
  const result5 = stableHash.xxHash64('x');
  assert.equal(typeof result5, 'bigint', `xxHash64 should return bigint, got: ${typeof result5}`);

  // Test 6: Verify .xxHash64 is accessible in ESM shim context
  // Use the same logic as the "実行モード網羅" section of the design doc
  function extractEsmShimSource(block) {
    const sm = '\n  globalThis.Bun = {';
    const em = '\n  globalThis.__claudeBun = globalThis.Bun;';
    const s = block.indexOf(sm);
    const e = block.indexOf(em, s);
    return block.slice(s + 1, e + em.length);
  }

  // Verify for both _helper and _bootstrap heredocs
  for (const markerKey of ['cat <<\'NODE\' > "$_helper"', 'cat <<\'NODE\' > "$_bootstrap"']) {
    const helperBlock = extractBlock(markerKey, '\n  export ENABLE_CLAUDEAI_MCP_SERVERS=');
    const stableHashSource = extractFunction(
      helperBlock,
      'function stableHash(value, seed) {',
      '\n\nfunction replaceRequired(source, pattern, replacement, label, expectedCount) {',
    );
    const context = vm.createContext({
      stringWidth: () => 0, wrapAnsi: v => v, stripANSI: v => v,
      sliceAnsi: s => s, sleepSync: () => {}, CellSegmenter: class {},
      process: { versions: {} }, Buffer, require,
    });
    context.module = { exports: {} };
    vm.runInContext(
      `${stableHashSource}\n${extractEsmShimSource(helperBlock)}\nmodule.exports = { Bun: globalThis.Bun, stableHash };`,
      context,
    );
    const { Bun, stableHash: contextStableHash } = context.module.exports;
    assert.equal(Bun.hash, contextStableHash, `Bun.hash should be identical to stableHash in ${markerKey}`);
    assert.equal(typeof Bun.hash.xxHash64, 'function', `Bun.hash.xxHash64 should be a function in ${markerKey}`);
    const testResult = Bun.hash.xxHash64('x').toString(36);
    assert.match(testResult, /^[0-9a-z]{1,13}$/, `Bun.hash.xxHash64('x').toString(36) should match pattern in ${markerKey}, got: ${testResult}`);
  }
});
