#!/usr/bin/env node
'use strict';

const cp = require('child_process');
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
  }

  run('npm', ['pack', spec, '--pack-destination', packDir]);
  const tgz = fs.readdirSync(packDir).find(name => name.endsWith('.tgz'));
  if (!tgz) {
    throw new Error('npm pack did not produce a tgz');
  }
  return path.join(packDir, tgz);
}

function validateOffsets(file, audited) {
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
