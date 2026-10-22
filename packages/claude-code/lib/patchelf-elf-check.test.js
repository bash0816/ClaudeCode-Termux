'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const r = require('./patchelf-runtime');

const LOADER = '/data/data/com.termux/files/usr/glibc/lib/ld-linux-aarch64.so.1';
const PATCHED = '/tmp/patched-claude';

const HEADER_OK = `ELF Header:
  Magic:   7f 45 4c 46 02 01 01 00 00 00 00 00 00 00 00 00
  Class:                             ELF64
  Data:                              2's complement, little endian
  Version:                           1 (current)
  OS/ABI:                            UNIX - System V
  ABI Version:                       0
  Type:                              DYN (Position-Independent Executable file)
  Machine:                           AArch64
`;

const LOAD_OK = `Elf file type is DYN (Position-Independent Executable file)
Entry point 0x1234
There are 11 program headers, starting at offset 64

Program Headers:
  Type           Offset             VirtAddr           PhysAddr
                 FileSiz            MemSiz              Flags  Align
  PHDR           0x0000000000000040 0x0000000000000040 0x0000000000000040
                 0x0000000000000268 0x0000000000000268  R      0x8
  INTERP         0x0000000000000270 0x0000000000000270 0x0000000000000270
                 0x000000000000001b 0x000000000000001b  R      0x1
      [Requesting program interpreter: ${LOADER}]
`;

const DYN_OK = `Dynamic section at offset 0x5a000 contains 30 entries:
  Tag        Type                         Name/Value
 0x0000000000000001 (NEEDED)             Shared library: [libc.so.6]
 0x0000000000000001 (NEEDED)             Shared library: [libm.so.6]
 0x0000000000000001 (NEEDED)             Shared library: [libgcc_s.so.1]
 0x000000000000000e (SONAME)             Library soname: [claude]
`;

function fixtureOutputs(overrides = {}) {
  return { '-h': HEADER_OK, '-l': LOAD_OK, '-d': DYN_OK, ...overrides };
}

// Fake readelf: prints the canned output for its first argument (-h, -l or -d) and exits with exitCode.
function writeFakeReadelf(t, canned, exitCode = 0) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-elf-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'readelf');
  const body = `const canned = ${JSON.stringify(canned)};\nconst out = canned[process.argv[2]];\nif (out !== undefined) process.stdout.write(out);\nif (${exitCode}) process.exitCode = ${exitCode};`;
  fs.writeFileSync(file, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  return file;
}

function verify(t, canned, exitCode = 0) {
  const readelfPath = writeFakeReadelf(t, canned, exitCode);
  return r.verifyPatchedElf({ readelfPath, patchedPath: PATCHED, loaderPath: LOADER });
}

test('(b5-1) well-formed readelf output returns the NEEDED list', t => {
  assert.deepEqual(verify(t, fixtureOutputs()), ['libc.so.6', 'libm.so.6', 'libgcc_s.so.1']);
});

test('(b5-1) Type EXEC is accepted as well as DYN', t => {
  const exec = HEADER_OK.replace('DYN (Position-Independent Executable file)', 'EXEC (Executable file)');
  assert.deepEqual(verify(t, fixtureOutputs({ '-h': exec })), ['libc.so.6', 'libm.so.6', 'libgcc_s.so.1']);
});

test('(b5-2) interpreter that differs from loaderPath fails', t => {
  const other = LOAD_OK.replace(LOADER, '/data/data/com.termux/files/usr/glibc/lib/ld-linux-x86-64.so.2');
  assert.throws(() => verify(t, fixtureOutputs({ '-l': other })), /interpreter .* expected/);
});

test('(b5-2) interpreter that is a prefix of loaderPath fails (exact match required)', t => {
  const prefix = LOAD_OK.replace(LOADER, LOADER.slice(0, -3));
  assert.throws(() => verify(t, fixtureOutputs({ '-l': prefix })), /interpreter .* expected/);
});

test('(b5-3) empty readelf -h output fails as missing', t => {
  assert.throws(() => verify(t, fixtureOutputs({ '-h': '' })), /missing or unparseable/);
});

test('(b5-3) non-ELF or garbage readelf -h output fails as unparseable', t => {
  const garbage = 'readelf: Error: Not an ELF file - it has the wrong magic bytes at the start\n';
  assert.throws(() => verify(t, fixtureOutputs({ '-h': garbage })), /missing or unparseable/);
});

test('(b5-4) Class ELF32 fails', t => {
  const elf32 = HEADER_OK.replace('ELF64', 'ELF32');
  assert.throws(() => verify(t, fixtureOutputs({ '-h': elf32 })), /class is ELF32, expected ELF64/);
});

test('(b5-4) big endian data encoding fails', t => {
  const big = HEADER_OK.replace("2's complement, little endian", "2's complement, big endian");
  assert.throws(() => verify(t, fixtureOutputs({ '-h': big })), /data encoding is .*big endian, expected little endian/);
});

test('(b5-4) Machine X86-64 fails', t => {
  const x86 = HEADER_OK.replace('AArch64', 'X86-64');
  assert.throws(() => verify(t, fixtureOutputs({ '-h': x86 })), /machine is X86-64, expected AArch64/);
});

test('(b5-5) readelf exiting non-zero fails and propagates the error', t => {
  assert.throws(() => verify(t, fixtureOutputs(), 1), /failed/);
});

test('(b5-6) NEEDED entry outside the allowlist fails and names it', t => {
  const extra = DYN_OK.replace('libgcc_s.so.1', 'libfoo.so.1');
  assert.throws(() => verify(t, fixtureOutputs({ '-d': extra })), /libfoo\.so\.1/);
});

test('(b5-7) interpreter line missing fails', t => {
  const noInterp = LOAD_OK.replace(`      [Requesting program interpreter: ${LOADER}]\n`, '');
  assert.throws(() => verify(t, fixtureOutputs({ '-l': noInterp })), /exactly one program interpreter line, found 0/);
});

test('(b5-7) duplicated interpreter line fails', t => {
  const twice = LOAD_OK + `      [Requesting program interpreter: ${LOADER}]\n`;
  assert.throws(() => verify(t, fixtureOutputs({ '-l': twice })), /exactly one program interpreter line, found 2/);
});
