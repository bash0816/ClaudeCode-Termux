'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  discoverModuleGraph,
  extractToProcessOwnedDir,
  cleanupStaleOwnedDirs,
  prepareProcessOwnedDir,
  readEntryContentPrefix,
} = require('./bunfs-extract.js');

const TRAILER = '\n---- Bun! ----\n';

// StandaloneModuleGraphの最小合成バイナリを構築する。
// レイアウト: [preamble padding][module contents][module table][Offsets(32byte)][trailer]
function buildSyntheticBinary({ modules, entryPointId, corruptTrailer = false, preamblePadding = 64 }) {
  const nameBuffers = modules.map((m) => Buffer.from(m.name, 'utf8'));
  const contentBuffers = modules.map((m) => Buffer.from(m.content ?? '', 'utf8'));

  const dataParts = [];
  const nameOffsets = [];
  const contOffsets = [];
  let cursor = 0;
  for (let i = 0; i < modules.length; i += 1) {
    nameOffsets.push(cursor);
    dataParts.push(nameBuffers[i]);
    cursor += nameBuffers[i].length;
  }
  for (let i = 0; i < modules.length; i += 1) {
    contOffsets.push(cursor);
    dataParts.push(contentBuffers[i]);
    cursor += contentBuffers[i].length;
  }
  const byteCountBeforeTable = cursor;

  const MODULE_TABLE_ENTRY_SIZE = 52;
  const modTable = Buffer.alloc(MODULE_TABLE_ENTRY_SIZE * modules.length);
  for (let i = 0; i < modules.length; i += 1) {
    const base = i * MODULE_TABLE_ENTRY_SIZE;
    modTable.writeUInt32LE(nameOffsets[i], base);
    modTable.writeUInt32LE(nameBuffers[i].length, base + 4);
    modTable.writeUInt32LE(contOffsets[i], base + 8);
    modTable.writeUInt32LE(contentBuffers[i].length, base + 12);
    modTable[base + 49] = modules[i].loader ?? 1; // 1 = js
  }
  const modulesOffset = byteCountBeforeTable;
  const modulesLength = modTable.length;
  const byteCount = byteCountBeforeTable + modulesLength;

  const offsetsBuf = Buffer.alloc(32);
  offsetsBuf.writeBigUInt64LE(BigInt(byteCount), 0);
  offsetsBuf.writeUInt32LE(modulesOffset, 8);
  offsetsBuf.writeUInt32LE(modulesLength, 12);
  offsetsBuf.writeUInt32LE(entryPointId, 16);

  const trailerBuf = Buffer.from(corruptTrailer ? '\n---- NOT BUN ----\n' : TRAILER, 'utf8');

  return Buffer.concat([
    Buffer.alloc(preamblePadding),
    ...dataParts,
    modTable,
    offsetsBuf,
    trailerBuf,
  ]);
}

function writeTempBinary(buf) {
  const file = path.join(os.tmpdir(), `bunfs-extract-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(file, buf);
  return file;
}

test('discoverModuleGraph parses a well-formed synthetic StandaloneModuleGraph', () => {
  const buf = buildSyntheticBinary({
    modules: [
      { name: '/$bunfs/root/cli', content: 'console.log("entry")' },
      { name: '/$bunfs/root/chunk-a.js', content: 'export const a = 1;' },
    ],
    entryPointId: 0,
  });
  const file = writeTempBinary(buf);
  try {
    const graph = discoverModuleGraph(file);
    try {
      assert.equal(graph.numModules, 2);
      assert.equal(graph.entryName, '/$bunfs/root/cli');
      assert.equal(graph.modules.length, 2);
      const prefix = readEntryContentPrefix(graph.fd, graph.entryModule, 256).toString('utf8');
      assert.equal(prefix, 'console.log("entry")');
    } finally {
      fs.closeSync(graph.fd);
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('discoverModuleGraph rejects a binary with a corrupted trailer', () => {
  const buf = buildSyntheticBinary({
    modules: [{ name: '/$bunfs/root/cli', content: 'x' }],
    entryPointId: 0,
    corruptTrailer: true,
  });
  const file = writeTempBinary(buf);
  try {
    assert.throws(() => discoverModuleGraph(file), /trailer not found/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('discoverModuleGraph rejects entry_point_id out of range', () => {
  const buf = buildSyntheticBinary({
    modules: [{ name: '/$bunfs/root/cli', content: 'x' }],
    entryPointId: 5, // 存在しないインデックス
  });
  const file = writeTempBinary(buf);
  try {
    assert.throws(() => discoverModuleGraph(file), /entry_point_id.*out of range/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('discoverModuleGraph rejects duplicate module names', () => {
  const buf = buildSyntheticBinary({
    modules: [
      { name: '/$bunfs/root/cli', content: 'a' },
      { name: '/$bunfs/root/cli', content: 'b' },
    ],
    entryPointId: 0,
  });
  const file = writeTempBinary(buf);
  try {
    assert.throws(() => discoverModuleGraph(file), /duplicate module name/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('discoverModuleGraph skips NAPI loader modules from extraction list', () => {
  const buf = buildSyntheticBinary({
    modules: [
      { name: '/$bunfs/root/cli', content: 'x' },
      { name: '/$bunfs/root/native.node', content: 'BINARY', loader: 10 },
    ],
    entryPointId: 0,
  });
  const file = writeTempBinary(buf);
  try {
    const graph = discoverModuleGraph(file);
    try {
      assert.equal(graph.modules.length, 1);
      assert.equal(graph.modules[0].name, '/$bunfs/root/cli');
    } finally {
      fs.closeSync(graph.fd);
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('extractToProcessOwnedDir rejects path traversal via module name', () => {
  const buf = buildSyntheticBinary({
    modules: [{ name: '/$bunfs/root/../../etc/passwd', content: 'evil' }],
    entryPointId: 0,
  });
  const file = writeTempBinary(buf);
  const ownedDir = path.join(os.tmpdir(), `bunfs-extract-owned-${process.pid}-${Date.now()}`);
  try {
    assert.throws(() => extractToProcessOwnedDir(file, ownedDir), /rejected unsafe module name|escapes owned dir/);
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(ownedDir, { recursive: true, force: true });
  }
});

test('extractToProcessOwnedDir writes module contents to the owned directory', () => {
  const buf = buildSyntheticBinary({
    modules: [
      { name: '/$bunfs/root/cli', content: 'entry-content' },
      { name: '/$bunfs/root/chunk-a.js', content: 'chunk-content' },
    ],
    entryPointId: 0,
  });
  const file = writeTempBinary(buf);
  const ownedDir = path.join(os.tmpdir(), `bunfs-extract-owned-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const { entryRelPath } = extractToProcessOwnedDir(file, ownedDir);
    assert.equal(entryRelPath, 'cli');
    assert.equal(fs.readFileSync(path.join(ownedDir, 'cli'), 'utf8'), 'entry-content');
    assert.equal(fs.readFileSync(path.join(ownedDir, 'chunk-a.js'), 'utf8'), 'chunk-content');
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(ownedDir, { recursive: true, force: true });
  }
});

test('cleanupStaleOwnedDirs keeps directories whose PID is still alive', () => {
  const workdir = path.join(os.tmpdir(), `bunfs-cleanup-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(workdir, { recursive: true });
  const aliveDir = path.join(workdir, `esm.${process.pid}.old.marker.bare-dir`);
  fs.mkdirSync(aliveDir);
  const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
  fs.utimesSync(aliveDir, oldTime, oldTime);
  try {
    cleanupStaleOwnedDirs(workdir, 'esm.');
    assert.ok(fs.existsSync(aliveDir), 'directory owned by a live PID must not be removed even if old');
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test('cleanupStaleOwnedDirs removes old directories whose PID is dead', () => {
  const workdir = path.join(os.tmpdir(), `bunfs-cleanup-test-${process.pid}-${Date.now()}-dead`);
  fs.mkdirSync(workdir, { recursive: true });
  // 実在しない可能性が極めて高い巨大なPID番号を使う
  const deadDir = path.join(workdir, `esm.999999999.old.marker.bare-dir`);
  fs.mkdirSync(deadDir);
  const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
  fs.utimesSync(deadDir, oldTime, oldTime);
  try {
    cleanupStaleOwnedDirs(workdir, 'esm.');
    assert.ok(!fs.existsSync(deadDir), 'stale directory owned by a dead PID should be removed');
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test('cleanupStaleOwnedDirs keeps recently modified directories regardless of PID', () => {
  const workdir = path.join(os.tmpdir(), `bunfs-cleanup-test-${process.pid}-${Date.now()}-recent`);
  fs.mkdirSync(workdir, { recursive: true });
  const recentDir = path.join(workdir, `esm.999999998.recent.marker.bare-dir`);
  fs.mkdirSync(recentDir);
  try {
    cleanupStaleOwnedDirs(workdir, 'esm.');
    assert.ok(fs.existsSync(recentDir), 'recently created directory must not be removed regardless of PID liveness');
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

test('prepareProcessOwnedDir extracts into a unique directory and returns entry path', () => {
  const buf = buildSyntheticBinary({
    modules: [{ name: '/$bunfs/root/cli', content: 'hello' }],
    entryPointId: 0,
  });
  const file = writeTempBinary(buf);
  const workdir = path.join(os.tmpdir(), `bunfs-prepare-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(workdir, { recursive: true });
  try {
    const { ownedDir, entryRelPath } = prepareProcessOwnedDir(file, workdir);
    assert.ok(ownedDir.startsWith(workdir));
    assert.equal(entryRelPath, 'cli');
    assert.equal(fs.readFileSync(path.join(ownedDir, 'cli'), 'utf8'), 'hello');
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});
