#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const manifestFile = path.join(repoRoot, 'config', 'claude-termux-release-manifest.json');
const rootReadmeFile = path.join(repoRoot, 'README.md');
const packageReadmeFile = path.join(repoRoot, 'packages', 'claude-code', 'README.md');

const START = '<!-- UPSTREAM_VERSION_START -->';
const END = '<!-- UPSTREAM_VERSION_END -->';

function fetchUpstreamDistTags() {
  try {
    const raw = execSync('npm view @anthropic-ai/claude-code dist-tags --json', { encoding: 'utf8' });
    const tags = JSON.parse(raw);
    return { latestVersion: tags.latest || null, stableVersion: tags.stable || null };
  } catch (err) {
    console.error(`WARNING: failed to fetch upstream dist-tags: ${err.message}`);
    return { latestVersion: null, stableVersion: null };
  }
}

function replaceBetween(content, startAnchor, endAnchor, replacement, fileLabel) {
  const startIndex = content.indexOf(startAnchor);
  if (startIndex === -1) throw new Error(`start anchor not found in ${fileLabel}`);
  const endIndex = content.indexOf(endAnchor, startIndex + startAnchor.length);
  if (endIndex === -1) throw new Error(`end anchor not found in ${fileLabel}`);
  return content.slice(0, startIndex) + startAnchor + replacement + endAnchor + content.slice(endIndex + endAnchor.length);
}

function buildSection(upstream, ourVersion) {
  const upstreamLatest = upstream.latestVersion || '(unknown)';
  const upstreamStable = upstream.stableVersion || '(unknown)';
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

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const ourVersion = manifest.latest_audited_version;
  if (!ourVersion) throw new Error('latest_audited_version not set in manifest');

  console.log('fetching upstream dist-tags...');
  const upstream = fetchUpstreamDistTags();
  console.log(`upstream latest: ${upstream.latestVersion || '(not found)'}`);
  console.log(`upstream stable: ${upstream.stableVersion || '(not found)'}`);
  console.log(`our version:     ${ourVersion}`);

  if (!upstream.latestVersion || !upstream.stableVersion) {
    const missing = [!upstream.latestVersion && 'latestVersion', !upstream.stableVersion && 'stableVersion'].filter(Boolean).join(', ');
    console.error(`WARNING: could not fetch from upstream: ${missing}`);
    if (process.argv.includes('--strict')) process.exit(1);
    console.error('skipping README update');
    process.exit(0);
  }

  const section = buildSection(upstream, ourVersion);
  updateReadme(rootReadmeFile, section);
  if (fs.existsSync(packageReadmeFile)) updateReadme(packageReadmeFile, section);
}

main();
