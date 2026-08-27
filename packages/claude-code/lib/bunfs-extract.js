'use strict';

const { openSync, readSync, closeSync, fstatSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync } = require('node:fs');
const path = require('node:path');

const TRAILER = Buffer.from('\n---- Bun! ----\n');
const OFFSETS_STRUCT_SIZE = 32;
const MODULE_TABLE_ENTRY_SIZE = 52;
const SCAN_CHUNK_SIZE = 1024 * 1024;
const NAPI_LOADER = 10;

function readRange(fd, offset, length) {
  const buf = Buffer.alloc(length);
  const bytesRead = readSync(fd, buf, 0, length, offset);
  if (bytesRead !== length) {
    throw new Error(`bunfs-extract: short read at offset ${offset} (expected ${length}, got ${bytesRead})`);
  }
  return buf;
}

function findTrailerOffset(fd, fileSize) {
  for (let end = fileSize; end > 0; end -= SCAN_CHUNK_SIZE) {
    const start = Math.max(0, end - SCAN_CHUNK_SIZE - TRAILER.length);
    const len = end - start;
    const buf = readRange(fd, start, len);
    const idx = buf.lastIndexOf(TRAILER);
    if (idx >= 0) return start + idx;
  }
  throw new Error('bunfs-extract: StandaloneModuleGraph trailer not found');
}

function isSafeUint(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function discoverModuleGraph(sourceBin) {
  const fd = openSync(sourceBin, 'r');
  try {
    const fileSize = fstatSync(fd).size;
    const trailerOffset = findTrailerOffset(fd, fileSize);

    const offsetsStructStart = trailerOffset - OFFSETS_STRUCT_SIZE;
    if (offsetsStructStart < 0) throw new Error('bunfs-extract: invalid trailer position');
    const offsetsBuf = readRange(fd, offsetsStructStart, OFFSETS_STRUCT_SIZE);
    const byteCount = Number(offsetsBuf.readBigUInt64LE(0));
    const modulesOffset = offsetsBuf.readUInt32LE(8);
    const modulesLength = offsetsBuf.readUInt32LE(12);
    const entryPointId = offsetsBuf.readUInt32LE(16);

    if (!isSafeUint(byteCount) || !isSafeUint(modulesOffset) || !isSafeUint(modulesLength)) {
      throw new Error('bunfs-extract: unsafe integer in Offsets struct');
    }
    if (modulesLength % MODULE_TABLE_ENTRY_SIZE !== 0) {
      throw new Error('bunfs-extract: module table length is not a multiple of entry size');
    }

    const dataStart = offsetsStructStart - byteCount;
    if (dataStart < 0) throw new Error('bunfs-extract: computed dataStart is negative');

    const numModules = modulesLength / MODULE_TABLE_ENTRY_SIZE;
    if (numModules <= 0) throw new Error('bunfs-extract: module table is empty');
    if (!(entryPointId >= 0 && entryPointId < numModules)) {
      throw new Error(`bunfs-extract: entry_point_id ${entryPointId} out of range (numModules=${numModules})`);
    }
    if (modulesOffset + modulesLength > byteCount) {
      throw new Error('bunfs-extract: module table extends beyond byte_count');
    }

    const modTableBuf = readRange(fd, dataStart + modulesOffset, modulesLength);

    const modules = [];
    const seenNames = new Set();
    let entryName = null;
    let entryModule = null;
    for (let i = 0; i < numModules; i += 1) {
      const base = i * MODULE_TABLE_ENTRY_SIZE;
      const nameOff = modTableBuf.readUInt32LE(base);
      const nameLen = modTableBuf.readUInt32LE(base + 4);
      const contOff = modTableBuf.readUInt32LE(base + 8);
      const contLen = modTableBuf.readUInt32LE(base + 12);
      const loader = modTableBuf[base + 49];

      if (!isSafeUint(nameOff) || !isSafeUint(nameLen) || !isSafeUint(contOff) || !isSafeUint(contLen)) {
        throw new Error(`bunfs-extract: unsafe integer in module table entry ${i}`);
      }
      if (nameOff + nameLen > byteCount) {
        throw new Error(`bunfs-extract: module ${i} name range out of bounds`);
      }
      if (contOff + contLen > byteCount) {
        throw new Error(`bunfs-extract: module ${i} content range out of bounds`);
      }

      const name = readRange(fd, dataStart + nameOff, nameLen).toString('utf-8');
      if (seenNames.has(name)) {
        throw new Error(`bunfs-extract: duplicate module name ${name}`);
      }
      seenNames.add(name);

      const absContOff = dataStart + contOff;
      if (i === entryPointId) {
        entryName = name;
        entryModule = { name, contOff: absContOff, contLen };
      }
      if (loader === NAPI_LOADER) continue; // ネイティブ.nodeバイナリは未使用、展開しない
      if (contLen === 0) continue;

      modules.push({ name, contOff: absContOff, contLen });
    }

    if (entryName === null) throw new Error('bunfs-extract: entry module not found');

    return { fd, modules, entryName, entryModule, numModules, byteCount };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function relPathFromModuleName(name) {
  const rel = name.replace(/^\/\$bunfs\/root\//, '');
  if (rel.includes('..') || path.isAbsolute(rel)) {
    throw new Error(`bunfs-extract: rejected unsafe module name ${name}`);
  }
  return rel;
}

function extractToProcessOwnedDir(sourceBin, ownedDir) {
  const graph = discoverModuleGraph(sourceBin);
  const { fd, modules, entryName } = graph;
  try {
    mkdirSync(ownedDir, { recursive: true });
    for (const mod of modules) {
      const rel = relPathFromModuleName(mod.name);
      const outPath = path.resolve(ownedDir, rel);
      if (path.relative(ownedDir, outPath).startsWith('..')) {
        throw new Error(`bunfs-extract: path escapes owned dir: ${mod.name}`);
      }
      mkdirSync(path.dirname(outPath), { recursive: true });
      const content = readRange(fd, mod.contOff, mod.contLen);
      writeFileSync(outPath, content);
    }
  } finally {
    closeSync(fd);
  }
  return { entryRelPath: relPathFromModuleName(entryName) };
}

function cleanupStaleOwnedDirs(workdir, prefix, now = Date.now()) {
  const maxAgeMs = 24 * 60 * 60 * 1000;
  let entries;
  try {
    entries = readdirSync(workdir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(prefix)) continue;
    const dirPath = path.join(workdir, entry.name);
    let stats;
    try {
      stats = statSync(dirPath);
    } catch {
      continue;
    }
    if (Number.isFinite(stats.mtimeMs) && now - stats.mtimeMs < maxAgeMs) continue;

    const pidMatch = entry.name.match(/^esm\.(\d+)\./);
    if (pidMatch) {
      const pid = Number(pidMatch[1]);
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          continue; // ESRCH以外(プロセス生存中、またはEPERM等)は削除対象から除外
        } catch (error) {
          if (error && error.code !== 'ESRCH') continue;
        }
      }
    }
    try {
      rmSync(dirPath, { recursive: true, force: true });
    } catch {}
  }
}

function prepareProcessOwnedDir(sourceBin, workdir) {
  const dirName = `esm.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}.bare-dir`;
  cleanupStaleOwnedDirs(workdir, 'esm.');
  const ownedDir = path.join(workdir, dirName);
  const { entryRelPath } = extractToProcessOwnedDir(sourceBin, ownedDir);
  return { ownedDir, entryRelPath };
}

function readEntryContentPrefix(fd, entryModule, maxLength = 256) {
  const length = Math.min(entryModule.contLen, maxLength);
  return readRange(fd, entryModule.contOff, length);
}

module.exports = {
  discoverModuleGraph,
  extractToProcessOwnedDir,
  cleanupStaleOwnedDirs,
  prepareProcessOwnedDir,
  readEntryContentPrefix,
};
