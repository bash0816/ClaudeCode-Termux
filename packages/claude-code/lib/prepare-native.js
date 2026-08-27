#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const packageDir = path.resolve(__dirname, '..');
const config = require(path.join(packageDir, 'config', 'claude-native-audited-versions.json'));
const pkg = require(path.join(packageDir, 'package.json'));
const version = process.argv[2] || pkg.version;
const item = config.versions[version];
const curlRetries = process.env.CLAUDE_TERMUX_FETCH_RETRIES || '4';
const curlConnectTimeout = process.env.CLAUDE_TERMUX_FETCH_CONNECT_TIMEOUT || '20';
const curlMaxTime = process.env.CLAUDE_TERMUX_FETCH_MAX_TIME || '300';

if (!item) {
  console.error(`Unsupported audited Claude Code version: ${version}`);
  process.exit(1);
}

const cacheRoot = process.env.CLAUDE_TERMUX_PACKAGE_CACHE || path.join(os.homedir(), '.claude-termux-native-package');
const versionDir = path.join(cacheRoot, 'versions', version);
const nativeDest = path.join(versionDir, 'app', 'node_modules', '@anthropic-ai', 'claude-code-linux-arm64');
const sourceBin = path.join(nativeDest, 'claude');

if (fs.existsSync(sourceBin)) {
  validateOffsets(sourceBin, item);
  process.exit(0);
}

fs.mkdirSync(versionDir, { recursive: true });
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), `claude-code-${version}-`));

try {
  const tgzPath = fetchNativeTarball(item.native_spec, packDir);
  verifyTarball(tgzPath, item);

  const extractDir = path.join(packDir, 'native');
  fs.mkdirSync(extractDir, { recursive: true });
  run('tar', ['-xzf', tgzPath, '-C', extractDir]);

  fs.rmSync(nativeDest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(nativeDest), { recursive: true });
  fs.cpSync(path.join(extractDir, 'package'), nativeDest, { recursive: true });
  validateOffsets(sourceBin, item);
} finally {
  fs.rmSync(packDir, { recursive: true, force: true });
}

function run(command, args) {
  const result = cp.spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

function runCapture(command, args) {
  const result = cp.spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

function fetchNativeTarball(spec, packDir) {
  const directTarball = path.join(packDir, 'native-package.tgz');

  try {
    const tarballUrl = runCapture('npm', ['view', spec, 'dist.tarball', '--json']).replace(/^"|"$/g, '');
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
    ]);
    if (fs.existsSync(directTarball)) {
      return directTarball;
    }
  } catch (error) {
    console.error(`Direct tarball fetch failed for ${spec}; falling back to npm pack.`);
    console.error(error && error.message ? error.message : String(error));
    fs.rmSync(directTarball, { force: true });
  }

  const packJson = runCapture('npm', ['pack', spec, '--pack-destination', packDir, '--json']);
  let packEntries;
  try {
    packEntries = JSON.parse(packJson);
  } catch (error) {
    throw new Error(`npm pack did not return valid JSON for ${spec}`);
  }
  const packEntry = Array.isArray(packEntries) ? packEntries.find(entry => entry && entry.filename) : null;
  if (!packEntry || !packEntry.filename) {
    throw new Error('npm pack did not produce a tgz');
  }
  return path.join(packDir, packEntry.filename);
}

function verifyTarball(file, audited) {
  const buf = fs.readFileSync(file);
  if (audited.tarball_sha256) {
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha256 !== audited.tarball_sha256) {
      throw new Error(`tarball sha256 mismatch for ${version}`);
    }
  }
  if (audited.tarball_integrity) {
    const sha512 = `sha512-${crypto.createHash('sha512').update(buf).digest('base64')}`;
    if (sha512 !== audited.tarball_integrity) {
      throw new Error(`tarball integrity mismatch for ${version}`);
    }
  }
  if (audited.tarball_size !== undefined && Number(audited.tarball_size) !== buf.length) {
    throw new Error(`tarball size mismatch for ${version}`);
  }
}

function validateOffsets(file, audited) {
  if (audited.entry_format === 'esm-chunked') {
    validateEsmChunkedOffsets(file, audited);
    return;
  }
  validateLegacyCjsOffsets(file, audited);
}

function validateLegacyCjsOffsets(file, audited) {
  const buf = fs.readFileSync(file);
  const start = Number(audited.entry_js_offset);
  const end = Number(audited.entry_end_offset);
  const startMarker = Buffer.from('function(exports, require, module, __filename, __dirname) {// Claude Code is a Beta product');
  const endMarker = Buffer.from('/$bunfs/root/image-processor.js');

  if (!(start > 0 && end > start && end <= buf.length)) {
    throw new Error(`invalid audited offsets for ${version}`);
  }
  if (!buf.subarray(start, start + startMarker.length).equals(startMarker)) {
    throw new Error(`audited start offset validation failed for ${version}`);
  }
  if (!buf.subarray(end, end + endMarker.length).equals(endMarker)) {
    throw new Error(`audited end offset validation failed for ${version}`);
  }
}

function validateEsmChunkedOffsets(file, audited) {
  // 371MB超のバイナリ全体をreadFileSyncしない(実機でOOM確認済み)。
  // discoverModuleGraphは範囲readSyncのみでトレイラー・モジュールテーブルを検証する。
  const { discoverModuleGraph, readEntryContentPrefix } = require(path.join(packageDir, 'lib', 'bunfs-extract.js'));
  const graph = discoverModuleGraph(file);
  try {
    if (!(graph.numModules > 0)) {
      throw new Error(`esm-chunked module graph is empty for ${version}`);
    }
    if (graph.entryName !== '/$bunfs/root/cli') {
      throw new Error(`esm-chunked entry module name mismatch for ${version}: ${graph.entryName}`);
    }
    const prefix = readEntryContentPrefix(graph.fd, graph.entryModule, 256).toString('utf8');
    const codeStart = prefix.replace(/^(\s*\/\/[^\n]*\n)+/, '').replace(/^\(/, '');
    if (codeStart.startsWith('function(exports, require, module, __filename, __dirname) {')) {
      throw new Error(`entry module for ${version} is legacy-cjs wrapped, but audited entry_format is esm-chunked`);
    }
  } finally {
    fs.closeSync(graph.fd);
  }
}
