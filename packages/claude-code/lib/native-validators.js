'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const packageDir = path.resolve(__dirname, '..');

function verifyTarball(file, audited, version) {
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

function validateOffsets(file, audited, version) {
  if (audited.entry_format === 'esm-chunked') {
    validateEsmChunkedOffsets(file, audited, version);
    return;
  }
  validateLegacyCjsOffsets(file, audited, version);
}

function validateLegacyCjsOffsets(file, audited, version) {
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

function validateEsmChunkedOffsets(file, audited, version) {
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
    if (audited.num_modules !== undefined && graph.numModules !== audited.num_modules) {
      throw new Error(`esm-chunked num_modules mismatch for ${version}: expected ${audited.num_modules}, got ${graph.numModules}`);
    }
    if (audited.byte_count !== undefined && graph.byteCount !== audited.byte_count) {
      throw new Error(`esm-chunked byte_count mismatch for ${version}: expected ${audited.byte_count}, got ${graph.byteCount}`);
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

module.exports = {
  validateEsmChunkedOffsets,
  validateLegacyCjsOffsets,
  validateOffsets,
  verifyTarball,
};
