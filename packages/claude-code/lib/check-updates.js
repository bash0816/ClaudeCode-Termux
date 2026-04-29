#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const packageDir = path.resolve(__dirname, '..');
const pkg = require(path.join(packageDir, 'package.json'));
const localManifest = require(path.join(packageDir, 'config', 'claude-termux-release-manifest.json'));
const mode = process.argv[2] || 'notify';
const currentVersion = process.argv[3] || pkg.version;
const dryRun = process.argv.includes('--dry-run');
const cacheRoot = process.env.CLAUDE_TERMUX_PACKAGE_CACHE || path.join(os.homedir(), '.claude-termux-native-package');
const cacheFile = path.join(cacheRoot, 'update-check.json');
const timeoutMs = Number(process.env.CLAUDE_TERMUX_UPDATE_TIMEOUT_MS || '1200');
const ttlMs = Number(process.env.CLAUDE_TERMUX_UPDATE_CACHE_TTL_MS || String(24 * 60 * 60 * 1000));
const skipCheck = process.env.CLAUDE_TERMUX_SKIP_UPDATE_CHECK === '1';
const manifestUrl = process.env.CLAUDE_TERMUX_MANIFEST_URL || localManifest.manifest_url;

function compareVersions(a, b) {
  const aParts = String(a).split('.').map(Number);
  const bParts = String(b).split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < len; index += 1) {
    const diff = (aParts[index] || 0) - (bParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(cache) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2) + '\n');
}

function fetchManifest(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`manifest fetch failed: HTTP ${response.statusCode}`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('manifest fetch timeout'));
    });
    req.on('error', reject);
  });
}

async function resolveManifest(forceRefresh) {
  if (skipCheck) {
    return { manifest: localManifest, cache: readCache() };
  }

  const cache = readCache();
  const now = Date.now();
  if (!forceRefresh && cache.manifest && cache.fetched_at && now - cache.fetched_at < ttlMs) {
    return { manifest: cache.manifest, cache };
  }

  try {
    const manifest = await fetchManifest(manifestUrl);
    const nextCache = {
      ...cache,
      fetched_at: now,
      manifest,
    };
    writeCache(nextCache);
    return { manifest, cache: nextCache };
  } catch {
    if (cache.manifest) {
      return { manifest: cache.manifest, cache };
    }
    return { manifest: localManifest, cache };
  }
}

function updateNoticeCache(cache, latestVersion) {
  const nextCache = {
    ...cache,
    last_notice: {
      current_version: currentVersion,
      latest_audited_version: latestVersion,
      notified_at: Date.now(),
    },
  };
  writeCache(nextCache);
}

function shouldNotify(cache, latestVersion) {
  const lastNotice = cache.last_notice;
  if (!lastNotice) return true;
  if (lastNotice.current_version !== currentVersion) return true;
  if (lastNotice.latest_audited_version !== latestVersion) return true;
  return Date.now() - Number(lastNotice.notified_at || 0) >= ttlMs;
}

function installTarget(targetVersion) {
  const spec = `${pkg.name}@${targetVersion}`;
  const command = `npm install -g ${spec}`;

  if (dryRun) {
    console.log(command);
    return 0;
  }

  console.error(`Updating to audited version ${targetVersion}`);
  const result = cp.spawnSync('npm', ['install', '-g', spec], {
    stdio: 'inherit',
    env: process.env,
  });
  return result.status === null ? 1 : result.status;
}

async function runNotify() {
  const { manifest, cache } = await resolveManifest(false);
  const latest = manifest.latest_audited_version || localManifest.latest_audited_version || pkg.version;
  if (compareVersions(currentVersion, latest) >= 0) return 0;
  if (!shouldNotify(cache, latest)) return 0;

  console.error(`Audited update available: ${currentVersion} -> ${latest}`);
  console.error('Run: claude update');
  updateNoticeCache(cache, latest);
  return 0;
}

async function runUpdate() {
  const { manifest } = await resolveManifest(true);
  const target = manifest.latest_audited_version || localManifest.latest_audited_version || pkg.version;
  if (compareVersions(currentVersion, target) >= 0) {
    console.error(`Already on latest audited version: ${currentVersion}`);
    return 0;
  }
  return installTarget(target);
}

async function main() {
  if (mode === 'notify') {
    process.exitCode = await runNotify();
    return;
  }

  if (mode === 'update') {
    process.exitCode = await runUpdate();
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
