#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const requested = process.argv[2] || '@latest';
const jsonOnly = process.argv.includes('--json');
const curlRetries = process.env.CLAUDE_TERMUX_FETCH_RETRIES || '4';
const curlConnectTimeout = process.env.CLAUDE_TERMUX_FETCH_CONNECT_TIMEOUT || '20';
const curlMaxTime = process.env.CLAUDE_TERMUX_FETCH_MAX_TIME || '300';

class NotEsmChunkedError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'NotEsmChunkedError';
  }
}

function normalizeVersion(input) {
  if (input === '@latest' || input === 'latest') return 'latest';
  if (input.startsWith('@anthropic-ai/claude-code@')) return input.split('@').pop();
  if (input.startsWith('@')) return input.slice(1);
  return input;
}

function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : (options.quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit'),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
  return options.capture ? result.stdout.trim() : '';
}

function runJson(command, args) {
  const output = run(command, args, { capture: true });
  return output ? JSON.parse(output) : null;
}

function resolveVersion(input) {
  const normalized = normalizeVersion(input);
  if (normalized === 'latest') {
    return run('npm', ['view', '@anthropic-ai/claude-code', 'version'], { capture: true });
  }
  return normalized;
}

function fetchNativeTarball(spec, packDir) {
  const directTarball = path.join(packDir, 'native-package.tgz');
  const distIntegrity = runJson('npm', ['view', spec, 'dist.integrity', '--json']);

  try {
    const tarballUrl = run('npm', ['view', spec, 'dist.tarball', '--json'], { capture: true }).replace(/^"|"$/g, '');
    if (!tarballUrl) {
      throw new Error(`npm view did not return dist.tarball for ${spec}`);
    }
    run('curl', [
      '--fail',
      '--location',
      '--retry', String(curlRetries),
      '--connect-timeout', String(curlConnectTimeout),
      '--max-time', String(curlMaxTime),
      '--output', directTarball,
      tarballUrl,
    ], { quiet: jsonOnly });
    if (fs.existsSync(directTarball)) {
      return { tgzPath: directTarball, tarballIntegrity: distIntegrity };
    }
  } catch (error) {
    if (!jsonOnly) {
      console.error(`Direct tarball fetch failed for ${spec}; falling back to npm pack.`);
      console.error(error && error.message ? error.message : String(error));
    }
  }

  run('npm', ['pack', spec, '--pack-destination', packDir], { quiet: jsonOnly });
  const tgz = fs.readdirSync(packDir).find(name => name.endsWith('.tgz'));
  if (!tgz) throw new Error('npm pack did not produce a tgz');
  return { tgzPath: path.join(packDir, tgz), tarballIntegrity: distIntegrity };
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function discoverLegacyCjsOffsets(buf) {
  const startMarker = Buffer.from('function(exports, require, module, __filename, __dirname) {// Claude Code is a Beta product');
  const endMarker = Buffer.from('/$bunfs/root/image-processor.js');
  const endOffset = buf.indexOf(endMarker);
  if (endOffset < 0) return null;

  let startOffset = -1;
  let next = -1;
  while ((next = buf.indexOf(startMarker, next + 1)) !== -1) {
    if (next < endOffset) startOffset = next;
  }
  if (startOffset < 0) return null;

  const entry = buf.subarray(startOffset, endOffset).toString('utf8').replace(/[\0\s]+$/g, '');
  if (!entry.startsWith('function(exports, require, module, __filename, __dirname) {')) return null;
  if (!entry.endsWith('})')) return null;

  return {
    entry_format: 'legacy-cjs',
    entry_js_offset: startOffset,
    entry_end_offset: endOffset,
    entry_size: endOffset - startOffset,
  };
}

function analyzeCycleHoists(ownedDirForAnalysis, options = {}) {
  const acorn = require('acorn');
  const walk = require('acorn-walk');

  const EXPECTED_ACORN_VERSION = '8.15.0';
  const actualAcornVersion = options.acornVersionOverride || require('acorn/package.json').version;
  if (actualAcornVersion !== EXPECTED_ACORN_VERSION) {
    throw new Error(`analyzeCycleHoists: acorn version mismatch: expected ${EXPECTED_ACORN_VERSION}, got ${actualAcornVersion}`);
  }

  const PREFIX = '/$bunfs/root/';
  const files = fs.readdirSync(ownedDirForAnalysis).filter((f) => f.endsWith('.js'));

  function stripPrefix(specifier) {
    return specifier.startsWith(PREFIX) ? specifier.slice(PREFIX.length) : null;
  }

  const staticEdges = new Map();
  const requireEdges = new Map();
  const asts = new Map();
  let parseFailureCount = 0;
  const parseFailureFiles = [];
  const skippedAssets = [];

  for (const f of files) {
    const buf = fs.readFileSync(path.join(ownedDirForAnalysis, f));
    const src = buf.toString('utf8');
    let ast;
    try {
      ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowImportExportEverywhere: true });
    } catch (e) {
      const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
      if (!f.startsWith('chunk-') && buf.length >= 4 && buf.subarray(0, 4).equals(ZSTD_MAGIC)) {
        skippedAssets.push(f);
        continue;
      }
      parseFailureCount += 1;
      parseFailureFiles.push(f);
      continue;
    }
    asts.set(f, { ast, src });

    const si = new Set();
    const ri = new Set();

    for (const stmt of ast.body) {
      if (stmt.type === 'ImportDeclaration' && typeof stmt.source?.value === 'string') {
        const t = stripPrefix(stmt.source.value);
        if (t) si.add(t);
      }
      if (
        (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportAllDeclaration') &&
        typeof stmt.source?.value === 'string'
      ) {
        const t = stripPrefix(stmt.source.value);
        if (t) si.add(t);
      }
    }

    walk.simple(ast, {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'MetaProperty' &&
          node.callee.property.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal' &&
          typeof node.arguments[0].value === 'string'
        ) {
          const t = stripPrefix(node.arguments[0].value);
          if (t) ri.add(t);
        }
      },
    });

    staticEdges.set(f, si);
    requireEdges.set(f, ri);
  }

  // fail-closed: 1件でもパース失敗があれば即座にエラー終了(例外を許容しない)
  if (parseFailureCount > 0) {
    throw new Error(`analyzeCycleHoists: ${parseFailureCount} file(s) failed to parse (${parseFailureFiles.join(', ')}); refusing to generate cycle_hoists (fail-closed)`);
  }

  function reaches(from, target, graph) {
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length) {
      const cur = stack.pop();
      for (const d of graph.get(cur) || []) {
        if (d === target) return true;
        if (!seen.has(d)) { seen.add(d); stack.push(d); }
      }
    }
    return false;
  }

  const staticOnly = [];
  for (const [f, reqs] of requireEdges) {
    for (const r of reqs) {
      if (!staticEdges.has(r)) continue;
      if (reaches(r, f, staticEdges)) staticOnly.push([f, r]);
    }
  }

  function isFunctionNode(n) {
    return n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';
  }
  function isIIFE(fnNode, parent) {
    return parent && parent.type === 'CallExpression' && parent.callee === fnNode;
  }
  function isTopLevelEager(ancestors) {
    for (let i = ancestors.length - 2; i >= 0; i -= 1) {
      const anc = ancestors[i];
      if (isFunctionNode(anc)) {
        const parentOfFn = ancestors[i - 1];
        if (isIIFE(anc, parentOfFn)) continue;
        return false;
      }
    }
    return true;
  }

  const byFile = new Map();
  for (const [f, r] of staticOnly) {
    if (!byFile.has(f)) byFile.set(f, new Set());
    byFile.get(f).add(r);
  }

  const cycleHoists = [];

  for (const [f, targets] of byFile) {
    const { ast, src } = asts.get(f);
    const callsForTarget = new Map();

    walk.fullAncestor(ast, (node, ancestors) => {
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'MetaProperty' &&
        node.callee.property.name === 'require' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal' &&
        typeof node.arguments[0].value === 'string'
      ) {
        const t = stripPrefix(node.arguments[0].value);
        if (!t || !targets.has(t)) return;
        const eager = isTopLevelEager(ancestors);
        if (!callsForTarget.has(t)) callsForTarget.set(t, []);
        callsForTarget.get(t).push({ eager, node });
      }
    });

    for (const t of targets) {
      const calls = callsForTarget.get(t);
      if (!calls || calls.length === 0) continue;
      const hasEager = calls.some((c) => c.eager);
      if (!hasEager) continue; // 全遅延なら記録しない

      const literal = `import.meta.require("/$bunfs/root/${t}")`;
      const expectedOccurrences = src.split(literal).length - 1;

      // assertProperties: eagerな呼出しサイトの直後にある .propertyName を収集
      const assertProperties = new Set();
      for (const c of calls) {
        if (!c.eager) continue;
        const afterCall = src.slice(c.node.end, c.node.end + 100);
        const m = afterCall.match(/^\.([A-Za-z_$][A-Za-z0-9_$]*)/);
        if (m) assertProperties.add(m[1]);
      }

      cycleHoists.push({
        file: f,
        targetModule: t,
        expectedOccurrences,
        assertProperties: [...assertProperties],
      });
    }
  }

  return { cycleHoists, skippedAssets: skippedAssets.sort() };
}

function discoverCycleHoists(binary, ownedDirForAnalysis) {
  const { extractToProcessOwnedDir } = require(path.join(__dirname, '..', 'packages', 'claude-code', 'lib', 'bunfs-extract.js'));
  extractToProcessOwnedDir(binary, ownedDirForAnalysis);
  return analyzeCycleHoists(ownedDirForAnalysis);
}

function discoverHooksStandalonePatches(ownedDirForAnalysis, options = {}) {
  const acorn = require('acorn');
  const walk = require('acorn-walk');
  const { countQleMatches } = require(path.join(__dirname, '..', 'packages', 'claude-code', 'lib', 'hooks-standalone-pattern.js'));
  const expectedAcorn = '8.15.0';
  const actualAcorn = options.acornVersionOverride || require('acorn/package.json').version;
  if (actualAcorn !== expectedAcorn) throw new Error('discoverHooksStandalonePatches: acorn version mismatch: expected ' + expectedAcorn + ', got ' + actualAcorn);
  const prefix = '/$bunfs/root/';
  const zstdMagic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const asts = new Map();
  for (const file of fs.readdirSync(ownedDirForAnalysis).filter((f) => f.endsWith('.js')).sort()) {
    const buf = fs.readFileSync(path.join(ownedDirForAnalysis, file));
    if (!file.startsWith('chunk-') && buf.length >= 4 && buf.subarray(0, 4).equals(zstdMagic)) continue;
    try {
      asts.set(file, { ast: acorn.parse(buf.toString('utf8'), { ecmaVersion: 'latest', sourceType: 'module', allowImportExportEverywhere: true }), src: buf.toString('utf8') });
    } catch (error) {
      throw new Error('discoverHooksStandalonePatches: failed to parse ' + file + ': ' + error.message, { cause: error });
    }
  }
  const identifiers = (node, out) => {
    if (!node) return;
    if (node.type === 'Identifier') return out.push(node.name);
    if (node.type === 'RestElement' || node.type === 'AssignmentPattern') return identifiers(node.argument || node.left, out);
    if (node.type === 'ArrayPattern') return node.elements.forEach((n) => identifiers(n, out));
    if (node.type === 'ObjectPattern') return node.properties.forEach((p) => identifiers(p.type === 'RestElement' ? p.argument : p.value, out));
  };
  const declarationNames = (ast) => {
    const out = [];
    walk.full(ast, (n) => {
      if (n.type === 'VariableDeclarator') identifiers(n.id, out);
      if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') identifiers(n.id, out);
      if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') n.params.forEach((p) => identifiers(p, out));
      if (n.type === 'CatchClause') identifiers(n.param, out);
      if (n.type === 'ImportSpecifier') identifiers(n.local, out);
    });
    return out;
  };
  const isMeta = (n, name) => n && n.type === 'MemberExpression' && !n.computed && n.object && n.object.type === 'MetaProperty' && n.object.meta.name === 'import' && n.object.property.name === 'meta' && n.property.type === 'Identifier' && n.property.name === name;
  const isQle = (n) => {
    if (!n || n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || !n.init || n.init.type !== 'ArrowFunctionExpression') return false;
    const fn = n.init;
    if (fn.params.length !== 3 || fn.params.some((p) => p.type !== 'Identifier')) return false;
    const [p1, p2, p3] = fn.params.map((p) => p.name);
    const body = fn.body;
    if (body.type !== 'ConditionalExpression') return false;
    const test = body.test;
    if (test.type !== 'CallExpression' || test.optional || test.arguments.length !== 0 || test.callee.type !== 'Identifier') return false;
    const yes = body.consequent;
    if (yes.type !== 'CallExpression' || yes.optional || yes.callee.type !== 'Identifier' || yes.arguments.length !== 3) return false;
    const [a, b, c] = yes.arguments;
    if (a.type !== 'Identifier' || a.name !== p2 || b.type !== 'CallExpression' || b.optional || b.callee.type !== 'Identifier' || b.callee.name !== p3 || b.arguments.length !== 0 || c.type !== 'Identifier' || c.name !== p1) return false;
    const no = body.alternate;
    if (no.type !== 'ObjectExpression' || no.properties.length !== 2) return false;
    return [['module', p2], ['folder', p1]].every(([key, value], i) => {
      const p = no.properties[i];
      return p && p.type === 'Property' && p.kind === 'init' && !p.computed && !p.method && !p.shorthand && ((p.key.type === 'Identifier' && p.key.name === key) || (p.key.type === 'Literal' && p.key.value === key)) && p.value.type === 'Identifier' && p.value.name === value;
    });
  };
  const qles = new Map();
  const names = new Map();
  for (const [file, rec] of asts) {
    const found = [];
    walk.simple(rec.ast, { VariableDeclarator(n) { if (isQle(n)) found.push(n); } });
    const regexCount = countQleMatches(rec.src);
    if (found.length !== regexCount) throw new Error('discoverHooksStandalonePatches: qle AST/regex count mismatch in ' + file + ': AST=' + found.length + ', regex=' + regexCount);
    qles.set(file, found);
    names.set(file, declarationNames(rec.ast));
  }
  const directExport = (file, exportedName) => {
    let found;
    for (const st of asts.get(file).ast.body) {
      if (st.type === 'ExportAllDeclaration') throw new Error('discoverHooksStandalonePatches: export * in ' + file + '; G1 に戻す');
      if (st.type !== 'ExportNamedDeclaration') continue;
      if (st.source) throw new Error('discoverHooksStandalonePatches: re-export in ' + file + '; G1 に戻す');
      if (st.declaration && st.declaration.type === 'VariableDeclaration') found = st.declaration.declarations.find((d) => d.id.type === 'Identifier' && d.id.name === exportedName) || found;
      for (const sp of st.specifiers || []) {
        const exported = sp.exported.type === 'Identifier' ? sp.exported.name : sp.exported.value;
        const local = sp.local.type === 'Identifier' ? sp.local.name : sp.local.value;
        if (exported === exportedName) found = qles.get(file).find((d) => d.id.name === local) || found;
      }
    }
    if (!found) throw new Error('discoverHooksStandalonePatches: direct export ' + exportedName + ' not found in ' + file + '; G1 に戻す');
    return found;
  };
  const resolve = (file, name) => {
    const locals = [];
    for (const st of asts.get(file).ast.body) if (st.type === 'VariableDeclaration') for (const d of st.declarations) if (d.id.type === 'Identifier' && d.id.name === name) locals.push(d);
    const imports = [];
    for (const st of asts.get(file).ast.body) if (st.type === 'ImportDeclaration') for (const sp of st.specifiers) if (sp.local.name === name) imports.push({ st, sp });
    if (locals.length) {
      if (imports.length || names.get(file).filter((n) => n === name).length !== 1) throw new Error('discoverHooksStandalonePatches: callee ' + name + ' is shadowed or multiply declared in ' + file + '; G1 に戻す');
      return { file, node: locals[0] };
    }
    if (imports.length !== 1 || imports[0].sp.type !== 'ImportSpecifier') throw new Error('discoverHooksStandalonePatches: callee ' + name + ' must be one named import in ' + file + '; G1 に戻す');
    const source = imports[0].st.source.value;
    if (typeof source !== 'string' || !source.startsWith(prefix) || !source.endsWith('.js')) throw new Error('discoverHooksStandalonePatches: unsupported import source in ' + file + '; G1 に戻す');
    const target = source.slice(prefix.length);
    if (!asts.has(target)) throw new Error('discoverHooksStandalonePatches: missing imported chunk ' + target + '; G1 に戻す');
    const imported = imports[0].sp.imported.type === 'Identifier' ? imports[0].sp.imported.name : imports[0].sp.imported.value;
    return { file: target, node: directExport(target, imported) };
  };
  const position = (src, offset) => { const before = src.slice(0, offset); return (before.split('\n').length) + ':' + (offset - before.lastIndexOf('\n')); };
  const failDir = (file, src, node, reason) => { throw new Error('discoverHooksStandalonePatches: import.meta.dir in ' + file + ' at ' + position(src, node.start) + ': ' + reason); };
  const used = new Set();
  let dirCount = 0;
  for (const [file, rec] of asts) walk.fullAncestor(rec.ast, (node, ancestors) => {
    const member = ['dir', 'path', 'file'].find((name) => isMeta(node, name));
    if (!member) return;
    if (member !== 'dir') throw new Error('discoverHooksStandalonePatches: import.meta.' + member + ' found in ' + file + '; G1 に戻す');
    dirCount += 1;
    const parent = ancestors[ancestors.length - 2];
    if (!parent || parent.type !== 'CallExpression' || parent.arguments[0] !== node) return failDir(file, rec.src, node, 'must be the first argument of a non-optional call');
    if (parent.optional || ancestors.some((a) => a.type === 'ChainExpression')) return failDir(file, rec.src, node, 'optional or ChainExpression call is unsupported');
    if (parent.callee.type !== 'Identifier') return failDir(file, rec.src, node, 'callee must be an Identifier');
    const resolved = resolve(file, parent.callee.name);
    if (!isQle(resolved.node)) return failDir(file, rec.src, node, 'callee ' + parent.callee.name + ' is not qle-shaped');
    used.add(resolved.file + ':' + resolved.node.start);
  });
  if (dirCount === 0) return [];
  return [...qles].filter(([file, decls]) => decls.some((d) => used.has(file + ':' + d.start))).map(([file]) => ({ file, expectedOccurrences: countQleMatches(asts.get(file).src) })).sort((a, b) => a.file.localeCompare(b.file));
}
function discoverEsmChunkedOffsets(binary, packDir) {
  // StandaloneModuleGraphコンテナ自体はlegacy-cjs(単一CJSラッパー)・esm-chunked
  // (1387個のESMチャンク)のどちらのバージョンにも存在する(実測確認: 2.1.241でも
  // 11モジュールのグラフが見つかる)。コンテナの有無では形式を判別できないため、
  // エントリモジュール("cli")の実コンテンツ先頭を見て、CJSラッパー関数
  // (`function(exports, require, module, __filename, __dirname) {`)で始まって
  // いなければesm-chunkedと判定する。
  const { discoverModuleGraph, readEntryContentPrefix, ModuleGraphNotFoundError } = require(path.join(__dirname, '..', 'packages', 'claude-code', 'lib', 'bunfs-extract.js'));
  let graph;
  try {
    try { graph = discoverModuleGraph(binary); }
    catch (error) {
      if (error instanceof ModuleGraphNotFoundError) {
        throw new NotEsmChunkedError(`discoverModuleGraph failed: ${error.message}`, { cause: error });
      }
      throw error;
    }
    const prefix = readEntryContentPrefix(graph.fd, graph.entryModule, 256).toString('utf8');
    const cjsWrapperPrefix = 'function(exports, require, module, __filename, __dirname) {';
    // コメント行を除いた実コード部分がCJSラッパーで始まっていればlegacy-cjs形式であり、
    // esm-chunkedとしては検出しない(discoverOffsets側でlegacy検出にフォールバックさせる)。
    // 実バイナリでは`(function(exports, ...) {`のように先頭に丸括弧が付くため、
    // 括弧を許容してチェックする。
    const codeStart = prefix.replace(/^(\s*\/\/[^\n]*\n)+/, '').replace(/^\(/, '');
    if (codeStart.startsWith(cjsWrapperPrefix)) {
      throw new NotEsmChunkedError('entry module is legacy-cjs wrapped, not esm-chunked');
    }
    const cycleAnalysisDir = path.join(packDir, 'cycle-analysis');
    const { cycleHoists, skippedAssets } = discoverCycleHoists(binary, cycleAnalysisDir);
    const hooks_standalone_patches = discoverHooksStandalonePatches(cycleAnalysisDir);
    return {
      entry_format: 'esm-chunked',
      num_modules: graph.numModules,
      byte_count: graph.byteCount,
      cycle_hoists: cycleHoists,
      cycle_hoists_skipped_assets: skippedAssets,
      hooks_standalone_patches,
    };
  } finally {
    if (graph) fs.closeSync(graph.fd);
  }
}

function discoverOffsets(binary, packDir, deps = {}) {
  const discoverEsm = deps.discoverEsmChunkedOffsets || discoverEsmChunkedOffsets;
  const discoverLegacy = deps.discoverLegacyCjsOffsets || discoverLegacyCjsOffsets;
  const binarySize = fs.statSync(binary).size;
  let esmChunkedError;
  try {
    const esmChunked = discoverEsm(binary, packDir);
    return { binary, binary_size: binarySize, ...esmChunked };
  } catch (error) {
    if (!(error instanceof NotEsmChunkedError)) throw error;
    esmChunkedError = error;
  }
  const legacy = discoverLegacy(fs.readFileSync(binary));
  if (legacy) return { binary, binary_size: binarySize, ...legacy };
  throw new Error(`failed to find embedded JS start marker (esm-chunked detection failed: ${esmChunkedError.message}; legacy-cjs marker also not found)`);
}

function main(deps = {}) {
  const resolve = deps.resolveVersion || resolveVersion;
  const fetch = deps.fetchNativeTarball || fetchNativeTarball;
  const execute = deps.run || run;
  const discover = deps.discoverOffsets || discoverOffsets;
  const log = deps.log || console.log;
  const version = resolve(requested);
  const workdir = process.env.WORKDIR || path.join(os.tmpdir(), `claude-${version}-native-poc`);
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), `claude-${version}-pack-`));
  const nativeSpec = `@anthropic-ai/claude-code-linux-arm64@${version}`;
  const nativeDest = path.join(workdir, 'app', 'node_modules', '@anthropic-ai', 'claude-code-linux-arm64');
  const sourceBin = path.join(nativeDest, 'claude');
  fs.rmSync(workdir, { recursive: true, force: true });
  fs.mkdirSync(nativeDest, { recursive: true });
  try {
    const { tgzPath, tarballIntegrity } = fetch(nativeSpec, packDir);
    const extractDir = path.join(packDir, 'native');
    fs.mkdirSync(extractDir, { recursive: true });
    execute('tar', ['-xzf', tgzPath, '-C', extractDir], { quiet: jsonOnly });
    fs.rmSync(nativeDest, { recursive: true, force: true });
    fs.cpSync(path.join(extractDir, 'package'), nativeDest, { recursive: true });
    const offsets = discover(sourceBin, packDir);
    const result = { version, wrapper_spec: `@anthropic-ai/claude-code@${version}`, native_spec: nativeSpec, tarball_integrity: tarballIntegrity, tarball_sha256: sha256(tgzPath), workdir, source_bin: sourceBin, ...offsets };
    if (jsonOnly) log(JSON.stringify(result, null, 2));
    else {
      log(`Prepared Claude Code native candidate: ${version}`); log(`source_bin: ${sourceBin}`); log(`entry_format: ${result.entry_format}`);
      if (result.entry_format === 'esm-chunked') { log(`num_modules: ${result.num_modules}`); log(`byte_count: ${result.byte_count}`); } else { log(`entry_js_offset: ${result.entry_js_offset}`); log(`entry_end_offset: ${result.entry_end_offset}`); }
      log(`tarball_integrity: ${result.tarball_integrity}`); log(`tarball_sha256: ${result.tarball_sha256}`);
    }
    return result;
  } finally { fs.rmSync(packDir, { recursive: true, force: true }); }
}

module.exports = {
  discoverOffsets,
  discoverHooksStandalonePatches,
  NotEsmChunkedError,
  main,
  discoverEsmChunkedOffsets,
  discoverLegacyCjsOffsets,
  discoverCycleHoists,
  analyzeCycleHoists,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
}
