'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateEsmChunkedOffsets,
} = require('./native-validators.js');

const {
  discoverModuleGraph,
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
  const file = path.join(os.tmpdir(), `native-validators-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(file, buf);
  return file;
}

test('validateEsmChunkedOffsets accepts matching num_modules and byte_count', () => {
  const buf = buildSyntheticBinary({
    modules: [
      { name: '/$bunfs/root/cli', content: 'export default 1;' },
    ],
    entryPointId: 0,
  });
  const file = writeTempBinary(buf);
  try {
    const graph = discoverModuleGraph(file);
    try {
      const audited = {
        num_modules: graph.numModules,
        byte_count: graph.byteCount,
        entry_format: 'esm-chunked',
        cycle_hoists: [],
      };
      assert.doesNotThrow(() => validateEsmChunkedOffsets(file, audited, '9.9.9'));
    } finally {
      fs.closeSync(graph.fd);
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('validateEsmChunkedOffsets rejects mismatched num_modules', () => {
  const buf = buildSyntheticBinary({
    modules: [
      { name: '/$bunfs/root/cli', content: 'export default 1;' },
    ],
    entryPointId: 0,
  });
  const file = writeTempBinary(buf);
  try {
    const graph = discoverModuleGraph(file);
    try {
      const audited = {
        num_modules: graph.numModules + 1, // intentionally wrong
        byte_count: graph.byteCount,
        entry_format: 'esm-chunked',
        cycle_hoists: [],
      };
      assert.throws(
        () => validateEsmChunkedOffsets(file, audited, '9.9.9'),
        /num_modules mismatch/,
      );
    } finally {
      fs.closeSync(graph.fd);
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('validateEsmChunkedOffsets rejects mismatched byte_count', () => {
  const buf = buildSyntheticBinary({
    modules: [
      { name: '/$bunfs/root/cli', content: 'export default 1;' },
    ],
    entryPointId: 0,
  });
  const file = writeTempBinary(buf);
  try {
    const graph = discoverModuleGraph(file);
    try {
      const audited = {
        num_modules: graph.numModules,
        byte_count: graph.byteCount + 1, // intentionally wrong
        entry_format: 'esm-chunked',
        cycle_hoists: [],
      };
      assert.throws(
        () => validateEsmChunkedOffsets(file, audited, '9.9.9'),
        /byte_count mismatch/,
      );
    } finally {
      fs.closeSync(graph.fd);
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});
