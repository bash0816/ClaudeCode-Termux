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

function discoverOffsets(binary) {
  const buf = fs.readFileSync(binary);
  const startMarker = Buffer.from('function(exports, require, module, __filename, __dirname) {// Claude Code is a Beta product');
  const endMarker = Buffer.from('/$bunfs/root/image-processor.js');
  const endOffset = buf.indexOf(endMarker);
  if (endOffset < 0) throw new Error('failed to find embedded JS end marker');

  let startOffset = -1;
  let next = -1;
  while ((next = buf.indexOf(startMarker, next + 1)) !== -1) {
    if (next < endOffset) startOffset = next;
  }
  if (startOffset < 0) throw new Error('failed to find embedded JS start marker');

  const entry = buf.subarray(startOffset, endOffset).toString('utf8').replace(/[\0\s]+$/g, '');
  if (!entry.startsWith('function(exports, require, module, __filename, __dirname) {')) {
    throw new Error('embedded JS start validation failed');
  }
  if (!entry.endsWith('})')) {
    throw new Error('embedded JS end validation failed');
  }

  return {
    binary,
    binary_size: buf.length,
    entry_js_offset: startOffset,
    entry_end_offset: endOffset,
    entry_size: endOffset - startOffset,
  };
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

    const offsets = discoverOffsets(sourceBin);
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
      console.log(`entry_js_offset: ${result.entry_js_offset}`);
      console.log(`entry_end_offset: ${result.entry_end_offset}`);
      console.log(`tarball_integrity: ${result.tarball_integrity}`);
      console.log(`tarball_sha256: ${result.tarball_sha256}`);
    }
  } finally {
    fs.rmSync(packDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
