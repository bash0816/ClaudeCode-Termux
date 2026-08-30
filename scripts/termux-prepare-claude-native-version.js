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

function discoverEsmChunkedOffsets(binary, packDir) {
  // StandaloneModuleGraphコンテナ自体はlegacy-cjs(単一CJSラッパー)・esm-chunked
  // (1387個のESMチャンク)のどちらのバージョンにも存在する(実測確認: 2.1.241でも
  // 11モジュールのグラフが見つかる)。コンテナの有無では形式を判別できないため、
  // エントリモジュール("cli")の実コンテンツ先頭を見て、CJSラッパー関数
  // (`function(exports, require, module, __filename, __dirname) {`)で始まって
  // いなければesm-chunkedと判定する。
  const { discoverModuleGraph, readEntryContentPrefix } = require(path.join(__dirname, '..', 'packages', 'claude-code', 'lib', 'bunfs-extract.js'));
  const graph = discoverModuleGraph(binary);
  try {
    const prefix = readEntryContentPrefix(graph.fd, graph.entryModule, 256).toString('utf8');
    const cjsWrapperPrefix = 'function(exports, require, module, __filename, __dirname) {';
    // コメント行を除いた実コード部分がCJSラッパーで始まっていればlegacy-cjs形式であり、
    // esm-chunkedとしては検出しない(discoverOffsets側でlegacy検出にフォールバックさせる)。
    // 実バイナリでは`(function(exports, ...) {`のように先頭に丸括弧が付くため、
    // 括弧を許容してチェックする。
    const codeStart = prefix.replace(/^(\s*\/\/[^\n]*\n)+/, '').replace(/^\(/, '');
    if (codeStart.startsWith(cjsWrapperPrefix)) {
      throw new Error('entry module is legacy-cjs wrapped, not esm-chunked');
    }
    const cycleAnalysisDir = path.join(packDir, 'cycle-analysis');
    const { cycleHoists, skippedAssets } = discoverCycleHoists(binary, cycleAnalysisDir);
    return {
      entry_format: 'esm-chunked',
      num_modules: graph.numModules,
      byte_count: graph.byteCount,
      cycle_hoists: cycleHoists,
      cycle_hoists_skipped_assets: skippedAssets,
    };
  } finally {
    fs.closeSync(graph.fd);
  }
}

function discoverOffsets(binary, packDir) {
  const binarySize = fs.statSync(binary).size;

  // esm-chunked検出はトレイラー起点の範囲readSyncのみで完結し、ファイル全体を
  // メモリへ読み込まない(389MB超のバイナリでOOMを避けるため、こちらを先に試す)。
  let esmChunkedError;
  try {
    const esmChunked = discoverEsmChunkedOffsets(binary, packDir);
    return { binary, binary_size: binarySize, ...esmChunked };
  } catch (error) {
    esmChunkedError = error;
  }

  // legacy-cjs検出はファイル全体のバイト列走査が必要(マーカー文字列が任意の位置に
  // ありうるため)。esm-chunked検出が失敗した場合のみ、ここで初めて全体を読み込む。
  const buf = fs.readFileSync(binary);
  const legacy = discoverLegacyCjsOffsets(buf);
  if (legacy) {
    return { binary, binary_size: binarySize, ...legacy };
  }

  throw new Error(`failed to find embedded JS start marker (esm-chunked detection failed: ${esmChunkedError.message}; legacy-cjs marker also not found)`);
}

function main() {
  const version = resolveVersion(requested);
  const workdir = process.env.WORKDIR || path.join(os.tmpdir(), `claude-${version}-native-poc`);
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), `claude-${version}-pack-`));
  const nativeSpec = `@anthropic-ai/claude-code-linux-arm64@${version}`;
  const nativeDest = path.join(workdir, 'app', 'node_modules', '@anthropic-ai', 'claude-code-linux-arm64');
  const sourceBin = path.join(nativeDest, 'claude');

  fs.rmSync(workdir, { recursive: true, force: true });
  fs.mkdirSync(nativeDest, { recursive: true });

  try {
    const { tgzPath, tarballIntegrity } = fetchNativeTarball(nativeSpec, packDir);

    const extractDir = path.join(packDir, 'native');
    fs.mkdirSync(extractDir, { recursive: true });
    run('tar', ['-xzf', tgzPath, '-C', extractDir], { quiet: jsonOnly });
    fs.rmSync(nativeDest, { recursive: true, force: true });
    fs.cpSync(path.join(extractDir, 'package'), nativeDest, { recursive: true });

    const offsets = discoverOffsets(sourceBin, packDir);
    const result = {
      version,
      wrapper_spec: `@anthropic-ai/claude-code@${version}`,
      native_spec: nativeSpec,
      tarball_integrity: tarballIntegrity,
      tarball_sha256: sha256(tgzPath),
      workdir,
      source_bin: sourceBin,
      ...offsets,
    };

    if (jsonOnly) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Prepared Claude Code native candidate: ${version}`);
      console.log(`source_bin: ${sourceBin}`);
      console.log(`entry_format: ${result.entry_format}`);
      if (result.entry_format === 'esm-chunked') {
        console.log(`num_modules: ${result.num_modules}`);
        console.log(`byte_count: ${result.byte_count}`);
      } else {
        console.log(`entry_js_offset: ${result.entry_js_offset}`);
        console.log(`entry_end_offset: ${result.entry_end_offset}`);
      }
      console.log(`tarball_integrity: ${result.tarball_integrity}`);
      console.log(`tarball_sha256: ${result.tarball_sha256}`);
    }
  } finally {
    fs.rmSync(packDir, { recursive: true, force: true });
  }
}

module.exports = {
  discoverOffsets,
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
