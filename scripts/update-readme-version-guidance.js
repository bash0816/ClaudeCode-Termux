#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const rootConfigFile = path.join(repoRoot, 'config', 'claude-native-audited-versions.json');
const packageConfigFile = path.join(repoRoot, 'packages', 'claude-code', 'config', 'claude-native-audited-versions.json');
const manifestFile = path.join(repoRoot, 'config', 'claude-termux-release-manifest.json');
const rootReadmeFile = path.join(repoRoot, 'README.md');
const packageReadmeFile = path.join(repoRoot, 'packages', 'claude-code', 'README.md');

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

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertSameVersions(rootConfig, packageConfig) {
  const rootVersions = Object.keys(rootConfig.versions).sort(compareVersions);
  const packageVersions = Object.keys(packageConfig.versions).sort(compareVersions);
  if (JSON.stringify(rootVersions) !== JSON.stringify(packageVersions)) {
    throw new Error('root/package version metadata mismatch');
  }
}

function replaceBetween(content, start, end, replacement, fileLabel) {
  const startIndex = content.indexOf(start);
  if (startIndex === -1) {
    throw new Error(`start anchor not found in ${fileLabel}`);
  }
  const searchIndex = startIndex + start.length;
  const endIndex = content.indexOf(end, searchIndex);
  if (endIndex === -1) {
    throw new Error(`end anchor not found in ${fileLabel}`);
  }
  return content.slice(0, searchIndex) + replacement + content.slice(endIndex);
}

function replaceToEnd(content, start, replacement, fileLabel) {
  const startIndex = content.indexOf(start);
  if (startIndex === -1) {
    throw new Error(`start anchor not found in ${fileLabel}`);
  }
  const searchIndex = startIndex + start.length;
  return content.slice(0, searchIndex) + replacement;
}

function maybeReplaceBetween(content, start, end, replacement) {
  if (!content.includes(start) || !content.includes(end)) {
    return content;
  }
  return replaceBetween(content, start, end, replacement, 'optional section');
}

function formatShellBlock(lines) {
  return `\`\`\`sh\n${lines.join('\n')}\n\`\`\``;
}

function formatTextBlock(lines) {
  return `\`\`\`text\n${lines.join('\n')}\n\`\`\``;
}

function renderVersionBullets(versions) {
  return versions.map(version => `- \`${version}\``).join('\n');
}

function renderInstallCommands(versions) {
  return versions.map(version => `npm install -g @bash0816/claude-code@${version}`);
}

function renderOverrideCommands(versions) {
  return versions.map(version => `CLAUDE_TERMUX_CLAUDE_VERSION=${version} claude --version`);
}

function updateRootReadme(content, versions, latestAudited) {
  const installBlock = [
    'Current quick examples:',
    '',
    '現在の quick example:',
    '',
    formatShellBlock(renderInstallCommands([latestAudited])),
    '',
  ].join('\n');

  content = replaceBetween(
    content,
    'Install a specific audited version.\n\n監査済みの固定 version を入れる場合:\n\n',
    '\n## Update / 更新\n',
    installBlock,
    'README.md install examples'
  );


  const expectedBlock = [
    formatTextBlock(['<installed_audited_version> (Claude Code)']),
    '',
    'Example:',
    '',
    '例:',
    '',
    formatTextBlock([`${latestAudited} (Claude Code)`]),
    '',
  ].join('\n');

  content = replaceBetween(
    content,
    'Expected version output:\n\n期待値:\n\n',
    '\n## Do Not Use / 非推奨\n',
    expectedBlock,
    'README.md expected output'
  );

  const overrideBlock = [
    formatShellBlock(renderOverrideCommands(versions)),
    '',
  ].join('\n');

  content = maybeReplaceBetween(
    content,
    'For development and verification, the launcher can switch between audited versions from the same package.\n\n開発・検証時のみ、同じ package から監査済み version を切り替えられます。\n\n',
    '\n## Native Version Metadata / native metadata\n',
    overrideBlock
  );

  return content;
}

function updatePackageReadme(content, versions, latestAudited) {
  const installBlock = [
    'Current quick examples:',
    '',
    '現在の quick example:',
    '',
    formatShellBlock(renderInstallCommands([latestAudited])),
    '',
  ].join('\n');

  content = replaceBetween(
    content,
    'Specific audited versions:\n\n監査済みの固定 version:\n\n',
    '\n## Update / 更新\n',
    installBlock,
    'packages/claude-code/README.md install examples'
  );

  const overrideBlock = [
    formatShellBlock(renderOverrideCommands(versions)),
    '',
  ].join('\n');

  content = maybeReplaceBetween(
    content,
    'Development override:\n\n開発・検証用 override:\n\n',
    '\n## Update / 更新\n',
    overrideBlock
  );

  const policySection = [
    '- Only audited versions in `config/claude-native-audited-versions.json` can run.',
    '- `config/claude-native-audited-versions.json` にある監査済み version だけを実行できます。',
    `- ${versions.map(version => `\`${version}\``).join(', ')} are included in the package metadata.`,
    `- ${versions.map(version => `\`${version}\``).join('、')} を package metadata に含めています。`,
    '- The metadata file is the source of truth for the currently audited set.',
    '- 現在の監査済み version 集合の source of truth は metadata file です。',
    '- Native artifacts are cached under `${HOME}/.claude-termux-native-package`.',
    '- native artifact は `${HOME}/.claude-termux-native-package` に cache します。',
    '- If native preparation fails, the command exits with an error.',
    '- native preparation に失敗した場合、command は error で終了します。',
    '',
  ].join('\n');

  content = replaceToEnd(
    content,
    '## Policy / 方針\n\n',
    policySection,
    'packages/claude-code/README.md policy'
  );

  return content;
}

function main() {
  const rootConfig = loadJson(rootConfigFile);
  const packageConfig = loadJson(packageConfigFile);
  const manifest = loadJson(manifestFile);

  assertSameVersions(rootConfig, packageConfig);

  const verifiedVersions = Object.keys(rootConfig.versions)
    .filter(version => rootConfig.versions[version].status === 'termux_verified')
    .sort(compareVersions);

  if (verifiedVersions.length === 0) {
    throw new Error('no termux_verified versions found');
  }

  if (!verifiedVersions.includes(manifest.latest_audited_version)) {
    throw new Error('manifest latest audited version is not termux_verified');
  }

  const rootReadme = fs.readFileSync(rootReadmeFile, 'utf8');
  const packageReadme = fs.readFileSync(packageReadmeFile, 'utf8');

  fs.writeFileSync(rootReadmeFile, updateRootReadme(rootReadme, verifiedVersions, manifest.latest_audited_version));
  fs.writeFileSync(packageReadmeFile, updatePackageReadme(packageReadme, verifiedVersions, manifest.latest_audited_version));
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
