#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?$/;
const BASE_RE = /^([0-9]+\.[0-9]+\.[0-9]+)(?:-([0-9]+))?$/;

const repoRoot = path.resolve(__dirname, '..');
const defaultAuditedFile = path.join(repoRoot, 'config', 'claude-native-audited-versions.json');

function assertVersion(value, label) {
  if (typeof value !== 'string' || !VERSION_RE.test(value)) {
    throw new Error(`resolve-stable-target: invalid ${label} version: ${JSON.stringify(value)}`);
  }
}

function parseVersion(version) {
  const match = BASE_RE.exec(version);
  return {
    base: match[1],
    n: match[2] === undefined ? 0 : Number(match[2]),
  };
}

// Pure function. `audited` is the `versions` object of
// config/claude-native-audited-versions.json (key = version, value has `status`).
// `isPublished(version)` must return a boolean.
function resolveTarget({ officialStable, audited, isPublished }) {
  assertVersion(officialStable, 'officialStable');
  if (typeof audited !== 'object' || audited === null || Array.isArray(audited)) {
    throw new Error('resolve-stable-target: audited must be the versions object');
  }
  if (typeof isPublished !== 'function') {
    throw new Error('resolve-stable-target: isPublished must be a function');
  }

  let best = null;
  for (const version of Object.keys(audited)) {
    if (!VERSION_RE.test(version)) {
      continue;
    }
    const { base, n } = parseVersion(version);
    if (base !== officialStable) {
      continue;
    }
    const entry = audited[version];
    if (!entry || entry.status !== 'termux_verified') {
      continue;
    }
    if (best === null || n > best.n) {
      best = { version, n };
    } else if (n === best.n) {
      throw new Error(`resolve-stable-target: ambiguous candidates with the same -N: ${best.version}, ${version}`);
    }
  }

  if (best === null) {
    return { target: null, reason: 'unverified' };
  }
  if (!isPublished(best.version)) {
    return { target: null, reason: 'unpublished', candidate: best.version };
  }
  return { target: best.version, reason: 'ok' };
}

function parseArgs(argv) {
  const opts = {};
  const allowed = ['--official', '--audited', '--published'];
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!allowed.includes(flag)) {
      throw new Error(`unknown argument: ${flag}`);
    }
    if (Object.prototype.hasOwnProperty.call(opts, flag)) {
      throw new Error(`duplicate argument: ${flag}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for ${flag}`);
    }
    opts[flag] = value;
  }
  if (opts['--official'] === undefined) {
    throw new Error('usage: node scripts/resolve-stable-target.js --official <version> [--audited <path>] [--published <version,version,...>]');
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  assertVersion(opts['--official'], '--official');

  const auditedFile = opts['--audited'] !== undefined ? path.resolve(opts['--audited']) : defaultAuditedFile;
  const config = JSON.parse(fs.readFileSync(auditedFile, 'utf8'));
  if (!config || typeof config.versions !== 'object' || config.versions === null) {
    throw new Error(`resolve-stable-target: no versions object in ${auditedFile}`);
  }

  const publishedList = opts['--published'] !== undefined ? opts['--published'].split(',') : [];
  for (const version of publishedList) {
    assertVersion(version, '--published');
  }
  const published = new Set(publishedList);

  const result = resolveTarget({
    officialStable: opts['--official'],
    audited: config.versions,
    isPublished: version => published.has(version),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 2;
  }
}

module.exports = { resolveTarget };
