'use strict';
// Writes a fake readelf (POSIX sh) whose output satisfies verifyPatchedElf in
// lib/patchelf-runtime.js: ELF64 / little endian / AArch64 / EXEC header, one
// program interpreter line, and NEEDED entries for each requested library.
// Any other invocation prints nothing and exits 0.
const fs = require('node:fs');

const realSh = '/data/data/com.termux/files/usr/bin/sh';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function printLines(lines) {
  return lines.map(line => `printf '%s\\n' ${shellQuote(line)}`).join('\n');
}

function writeFakeReadelf(file, { loaderPath, needed = ['libc.so.6', 'libm.so.6'], logFile } = {}) {
  if (typeof loaderPath !== 'string' || loaderPath === '') throw new TypeError('writeFakeReadelf: loaderPath is required');
  const header = [
    '  Class:                             ELF64',
    "  Data:                              2's complement, little endian",
    '  Type:                              EXEC (Executable file)',
    '  Machine:                           AArch64',
  ];
  const interpreter = [`      [Requesting program interpreter: ${loaderPath}]`];
  const dynamic = needed.map(name => `0x0000000000000001 (NEEDED)             Shared library: [${name}]`);
  // Optional call log in the same {tool, args} JSON-lines format the other fakes use.
  const log = logFile === undefined ? '' : [
    `printf '%s' ${shellQuote('{"tool":"readelf","args":[')} >> ${shellQuote(logFile)}`,
    "sep=''",
    `for arg in "$@"; do printf '%s"%s"' "$sep" "$arg" >> ${shellQuote(logFile)}; sep=','; done`,
    `printf '%s\\n' ${shellQuote(']}')} >> ${shellQuote(logFile)}`,
  ].join('\n');
  const script = [
    `#!${realSh}`,
    log,
    'case "$1" in',
    '  -h)',
    printLines(header),
    '    ;;',
    '  -l)',
    printLines(interpreter),
    '    ;;',
    '  -d)',
    printLines(dynamic),
    '    ;;',
    '  *)',
    '    ;;',
    'esac',
    'exit 0',
    '',
  ].join('\n');
  fs.writeFileSync(file, script, { mode: 0o755 });
}

module.exports = { writeFakeReadelf };
