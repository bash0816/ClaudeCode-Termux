#!/usr/bin/env node
'use strict';

// Runs `claude doctor` and updates README.md with upstream version info.
// Call this at release time after installing the new package version.

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestFile = path.join(repoRoot, 'config', 'claude-termux-release-manifest.json');
const rootReadmeFile = path.join(repoRoot, 'README.md');
const packageReadmeFile = path.join(repoRoot, 'packages', 'claude-code', 'README.md');

const START = '<!-- UPSTREAM_VERSION_START -->';
const END = '<!-- UPSTREAM_VERSION_END -->';

function stripAnsi(text) {
  return text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b[=>]/g, '')
    .replace(/\x1b\[[0-9]+[GH]/g, ' ')
    .replace(/[^\x20-\x7e\n]/g, '');
}

function runDoctor() {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    // script(1) allocates a PTY so claude doctor renders version info
    const proc = spawn('script', ['-q', '-c', 'claude doctor', '/dev/null'], {
      env: { ...process.env },
    });
    let output = '';
    proc.stdout.on('data', d => { output += d.toString(); });
    proc.stderr.on('data', d => { output += d.toString(); });

    // Auto-close: send Enter after 8s to dismiss the TUI, then kill at 15s
    const enterTimer = setTimeout(() => {
      try { proc.stdin.write('\n'); } catch (_) {}
    }, 8000);
    const killTimer = setTimeout(() => {
      try { proc.kill(); } catch (_) {}
    }, 15000);

    proc.on('close', () => {
      clearTimeout(enterTimer);
      clearTimeout(killTimer);
      resolve(stripAnsi(output));
    });
    proc.on('error', err => {
      clearTimeout(enterTimer);
      clearTimeout(killTimer);
      reject(err);
    });
  });
}

function parseDoctor(output) {
  // Normalize: cursor-position codes merge lines; search the whole blob
  const blob = output.replace(/\s+/g, ' ');
  let latestVersion = null;
  let stableVersion = null;

  const latestMatch = blob.match(/[Ll]atest\s*version\s*:\s*(\d[\d.]+(?:-[\w.]+)?)/);
  if (latestMatch) latestVersion = latestMatch[1];

  const stableMatch = blob.match(/[Ss]table\s*version\s*:\s*(\d[\d.]+(?:-[\w.]+)?)/);
  if (stableMatch) stableVersion = stableMatch[1];

  return { latestVersion, stableVersion };
}

function replaceBetween(content, startAnchor, endAnchor, replacement, fileLabel) {
  const startIndex = content.indexOf(startAnchor);
  if (startIndex === -1) throw new Error(`start anchor not found in ${fileLabel}`);
  const searchIndex = startIndex + startAnchor.length;
  const endIndex = content.indexOf(endAnchor, searchIndex);
  if (endIndex === -1) throw new Error(`end anchor not found in ${fileLabel}`);
  return content.slice(0, startIndex) + startAnchor + replacement + endAnchor + content.slice(endIndex + endAnchor.length);
}

function buildSection(upstream, ourVersion) {
  const { latestVersion, stableVersion } = upstream;
  const upstreamLatest = latestVersion || '(unknown)';
  const upstreamStable = stableVersion || '(unknown)';
  return `
Official upstream (\`@anthropic-ai/claude-code\`): latest \`${upstreamLatest}\` / stable \`${upstreamStable}\`
This repo's published latest audited release: \`${ourVersion}\`

公式 upstream (\`@anthropic-ai/claude-code\`): latest \`${upstreamLatest}\` / stable \`${upstreamStable}\`
この repo の公開 latest audited release: \`${ourVersion}\`
`;
}

function updateReadme(filePath, section) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(START)) {
    console.log(`skipping ${path.basename(filePath)}: no ${START} marker`);
    return;
  }
  const updated = replaceBetween(content, START, END, section, filePath);
  fs.writeFileSync(filePath, updated);
  console.log(`updated: ${path.relative(repoRoot, filePath)}`);
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const ourVersion = manifest.latest_audited_version;
  if (!ourVersion) throw new Error('latest_audited_version not set in manifest');

  console.log('running claude doctor...');
  const doctorOutput = await runDoctor();

  const upstream = parseDoctor(doctorOutput);
  console.log(`upstream latest: ${upstream.latestVersion || '(not found)'}`);
  console.log(`upstream stable: ${upstream.stableVersion || '(not found)'}`);
  console.log(`our version:     ${ourVersion}`);

  if (!upstream.latestVersion) {
    console.error('WARNING: could not parse upstream version from claude doctor output');
    if (process.argv.includes('--strict')) process.exit(1);
  }

  const section = buildSection(upstream, ourVersion);
  updateReadme(rootReadmeFile, section);
  if (fs.existsSync(packageReadmeFile)) {
    updateReadme(packageReadmeFile, section);
  }
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
