#!/usr/bin/env sh
set -eu

SOURCE_BIN="${SOURCE_BIN:?SOURCE_BIN is required}"
WORKDIR="${WORKDIR:-${HOME}/.claude-termux-native-package/launcher-workdir}"
ENTRY_JS_OFFSET="${ENTRY_JS_OFFSET:?ENTRY_JS_OFFSET is required}"
ENTRY_END_OFFSET="${ENTRY_END_OFFSET:?ENTRY_END_OFFSET is required}"
CURRENT_CLAUDE_VERSION="${CURRENT_CLAUDE_VERSION:?CURRENT_CLAUDE_VERSION is required}"
CLAUDE_TERMUX_PACKAGE_DIR="${CLAUDE_TERMUX_PACKAGE_DIR:?CLAUDE_TERMUX_PACKAGE_DIR is required}"
TERMUX_TMPDIR="${TMPDIR:-/data/data/com.termux/files/usr/tmp}"
SSL_CERT_DIR="${SSL_CERT_DIR:-/data/data/com.termux/files/usr/etc/tls}"
SSL_CERT_FILE="${SSL_CERT_FILE:-/data/data/com.termux/files/usr/etc/tls/cert.pem}"
DISABLE_AUTOUPDATER="${DISABLE_AUTOUPDATER:-1}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd node
need_cmd termux-open-url

if [ ! -f "${SOURCE_BIN}" ]; then
  echo "Missing source binary: ${SOURCE_BIN}" >&2
  exit 1
fi

mkdir -p "${WORKDIR}"
mkdir -p "${TERMUX_TMPDIR}"

export TMPDIR="${TERMUX_TMPDIR}"
export SSL_CERT_DIR
export SSL_CERT_FILE
export DISABLE_AUTOUPDATER
export SOURCE_BIN
export WORKDIR
export ENTRY_JS_OFFSET
export ENTRY_END_OFFSET
export CURRENT_CLAUDE_VERSION

_pf=0
for _a in "$@"; do
  case "$_a" in
    -p|--print) _pf=1; break ;;
    --) break ;;
  esac
done

if [ "$_pf" = "1" ] && [ "${CLAUDE_TERMUX_STDIN:-}" != "inherit" ]; then
  _helper=$(mktemp "${TMPDIR:-/tmp}/claude-helper.XXXXXX.js")
  trap 'rm -f "$_helper"' EXIT HUP INT TERM
  cat <<'NODE' > "$_helper"
const fs = require('fs');
const path = require('path');
const {
  BLOCK_MESSAGE,
  createGuardedChildProcess,
} = require(path.join(process.env.CLAUDE_TERMUX_PACKAGE_DIR, 'lib', 'native-update-guard.js'));

const sourceBin = process.env.SOURCE_BIN;
const workdir = process.env.WORKDIR;
const entryJsOffset = Number(process.env.ENTRY_JS_OFFSET);
const entryEndOffset = Number(process.env.ENTRY_END_OFFSET);
const argv = process.argv.slice(2);

class RequestedExit extends Error {
  constructor(code) {
    super(`process.exit ${code}`);
    this.name = 'RequestedExit';
    this.code = code;
  }
}

function ensureEntryFile() {
  const extractedFile = path.join(workdir, `cli.${entryJsOffset}.${entryEndOffset}.bare-path.js`);
  if (fs.existsSync(extractedFile)) return extractedFile;

  const len = entryEndOffset - entryJsOffset;
  if (!(len > 0)) throw new Error('invalid replay offsets');

  const fd = fs.openSync(sourceBin, 'r');
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, entryJsOffset);
  fs.closeSync(fd);

  fs.writeFileSync(extractedFile, buf.toString('utf8').replace(/[\0\s]+$/g, ''));
  return extractedFile;
}

function stringWidth(value) {
  const text = String(value ?? '');
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    let width = 0;
    for (const _segment of segmenter.segment(text)) width += 1;
    return width;
  }
  return Array.from(text).length;
}

function createFakeRequire(realRequire) {
  const realChild = realRequire('child_process');

  function rewriteArgs(args) {
    if (
      Array.isArray(args) &&
      args[0] === 'xdg-open' &&
      Array.isArray(args[1]) &&
      typeof args[1][0] === 'string'
    ) {
      return ['termux-open-url', [args[1][0]], ...args.slice(2)];
    }
    return args;
  }

  const guardedChild = createGuardedChildProcess(
    {
      spawn: (...args) => realChild.spawn(...rewriteArgs(args)),
      execFile: (...args) => realChild.execFile(...args),
      exec: (...args) => realChild.exec(...args),
      spawnSync: (...args) => realChild.spawnSync(...rewriteArgs(args)),
      execFileSync: (...args) => realChild.execFileSync(...args),
      execSync: (...args) => realChild.execSync(...args),
    },
    value => process.stderr.write(value),
  );

  return function fakeRequire(id) {
    if (id === 'ws') {
      class WS {
        on() {}
        once() {}
        addEventListener() {}
        close() {}
        send() {}
        ping() {}
      }
      return { default: WS, WebSocket: WS };
    }

    if (id === 'child_process') {
      return guardedChild;
    }

    if (id === 'node:child_process') {
      return guardedChild;
    }

    if (id.startsWith('/$bunfs/root/')) {
      throw new Error('bunfs require blocked: ' + id);
    }

    return realRequire(id);
  };
}

async function main() {
  const extractedFile = ensureEntryFile();
  const code = fs.readFileSync(extractedFile, 'utf8');
  const fn = eval('(' + code);

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;
  const originalBun = process.versions.bun;
  const hadGlobalBun = Object.prototype.hasOwnProperty.call(globalThis, 'Bun');
  const originalGlobalBun = globalThis.Bun;
  const asyncErrors = [];

  const fakeRequire = createFakeRequire(require);
  function onAsyncError(error) {
    asyncErrors.push(error);
  }

  try {
    process.once('uncaughtException', onAsyncError);
    process.once('unhandledRejection', onAsyncError);
    Object.defineProperty(process.versions, 'bun', { value: '1.1.8', configurable: true });
    globalThis.Bun = { version: '1.1.8', stringWidth };
    process.argv = ['node', extractedFile, ...argv];
    process.exit = code => {
      throw new RequestedExit(code);
    };

    const moduleLike = { exports: {} };
    const maybePromise = fn(moduleLike.exports, fakeRequire, moduleLike, extractedFile, workdir);
    if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
    await new Promise(resolve => setTimeout(resolve, 200));
    if (asyncErrors.length > 0) throw asyncErrors[0];
  } catch (error) {
    if (error instanceof RequestedExit) {
      process.exitCode = error.code;
      return;
    }
    throw error;
  } finally {
    process.removeListener('uncaughtException', onAsyncError);
    process.removeListener('unhandledRejection', onAsyncError);
    process.argv = originalArgv;
    process.exit = originalExit;
    try {
      if (originalBun === undefined) {
        delete process.versions.bun;
      } else {
        Object.defineProperty(process.versions, 'bun', { value: originalBun, configurable: true });
      }
    } catch {}
    if (hadGlobalBun) globalThis.Bun = originalGlobalBun;
    else delete globalThis.Bun;
  }
}

main().catch(error => {
  if (error && error.code === 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED') {
    console.error(BLOCK_MESSAGE);
    process.exit(error.status || 1);
  }
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
NODE
  node "$_helper" "$@" </dev/null
  _status=$?
  rm -f "$_helper"
  trap - EXIT HUP INT TERM
  exit "$_status"
else
  _bootstrap=$(mktemp "${TMPDIR:-/tmp}/claude-bootstrap.XXXXXX.js")
  trap 'rm -f "$_bootstrap"' EXIT HUP INT TERM
  cat <<'NODE' > "$_bootstrap"
const fs = require('fs');
const path = require('path');
const {
  BLOCK_MESSAGE,
  createGuardedChildProcess,
} = require(path.join(process.env.CLAUDE_TERMUX_PACKAGE_DIR, 'lib', 'native-update-guard.js'));

const sourceBin = process.env.SOURCE_BIN;
const workdir = process.env.WORKDIR;
const entryJsOffset = Number(process.env.ENTRY_JS_OFFSET);
const entryEndOffset = Number(process.env.ENTRY_END_OFFSET);
const argv = process.argv.slice(2);

class RequestedExit extends Error {
  constructor(code) {
    super(`process.exit ${code}`);
    this.name = 'RequestedExit';
    this.code = code;
  }
}

function ensureEntryFile() {
  const extractedFile = path.join(workdir, `cli.${entryJsOffset}.${entryEndOffset}.bare-path.js`);
  if (fs.existsSync(extractedFile)) return extractedFile;

  const len = entryEndOffset - entryJsOffset;
  if (!(len > 0)) throw new Error('invalid replay offsets');

  const fd = fs.openSync(sourceBin, 'r');
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, entryJsOffset);
  fs.closeSync(fd);

  fs.writeFileSync(extractedFile, buf.toString('utf8').replace(/[\0\s]+$/g, ''));
  return extractedFile;
}

function stringWidth(value) {
  const text = String(value ?? '');
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    let width = 0;
    for (const _segment of segmenter.segment(text)) width += 1;
    return width;
  }
  return Array.from(text).length;
}

function createFakeRequire(realRequire) {
  const realChild = realRequire('child_process');

  function rewriteArgs(args) {
    if (
      Array.isArray(args) &&
      args[0] === 'xdg-open' &&
      Array.isArray(args[1]) &&
      typeof args[1][0] === 'string'
    ) {
      return ['termux-open-url', [args[1][0]], ...args.slice(2)];
    }
    return args;
  }

  const guardedChild = createGuardedChildProcess(
    {
      spawn: (...args) => realChild.spawn(...rewriteArgs(args)),
      execFile: (...args) => realChild.execFile(...args),
      exec: (...args) => realChild.exec(...args),
      spawnSync: (...args) => realChild.spawnSync(...rewriteArgs(args)),
      execFileSync: (...args) => realChild.execFileSync(...args),
      execSync: (...args) => realChild.execSync(...args),
    },
    value => process.stderr.write(value),
  );

  return function fakeRequire(id) {
    if (id === 'ws') {
      class WS {
        on() {}
        once() {}
        addEventListener() {}
        close() {}
        send() {}
        ping() {}
      }
      return { default: WS, WebSocket: WS };
    }

    if (id === 'child_process') {
      return guardedChild;
    }

    if (id === 'node:child_process') {
      return guardedChild;
    }

    if (id.startsWith('/$bunfs/root/')) {
      throw new Error('bunfs require blocked: ' + id);
    }

    return realRequire(id);
  };
}

async function main() {
  const extractedFile = ensureEntryFile();
  const code = fs.readFileSync(extractedFile, 'utf8');
  const fn = eval('(' + code);

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;
  const originalBun = process.versions.bun;
  const hadGlobalBun = Object.prototype.hasOwnProperty.call(globalThis, 'Bun');
  const originalGlobalBun = globalThis.Bun;
  const asyncErrors = [];

  const fakeRequire = createFakeRequire(require);
  function onAsyncError(error) {
    asyncErrors.push(error);
  }

  try {
    process.once('uncaughtException', onAsyncError);
    process.once('unhandledRejection', onAsyncError);
    Object.defineProperty(process.versions, 'bun', { value: '1.1.8', configurable: true });
    globalThis.Bun = { version: '1.1.8', stringWidth };
    process.argv = ['node', extractedFile, ...argv];
    process.exit = code => {
      throw new RequestedExit(code);
    };

    const moduleLike = { exports: {} };
    const maybePromise = fn(moduleLike.exports, fakeRequire, moduleLike, extractedFile, workdir);
    if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
    await new Promise(resolve => setTimeout(resolve, 200));
    if (asyncErrors.length > 0) throw asyncErrors[0];
  } catch (error) {
    if (error instanceof RequestedExit) {
      process.exitCode = error.code;
      return;
    }
    throw error;
  } finally {
    process.removeListener('uncaughtException', onAsyncError);
    process.removeListener('unhandledRejection', onAsyncError);
    process.argv = originalArgv;
    process.exit = originalExit;
    try {
      if (originalBun === undefined) {
        delete process.versions.bun;
      } else {
        Object.defineProperty(process.versions, 'bun', { value: originalBun, configurable: true });
      }
    } catch {}
    if (hadGlobalBun) globalThis.Bun = originalGlobalBun;
    else delete globalThis.Bun;
  }
}

main().catch(error => {
  if (error && error.code === 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED') {
    console.error(BLOCK_MESSAGE);
    process.exit(error.status || 1);
  }
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
NODE
  node "$_bootstrap" "$@"
  _status=$?
  rm -f "$_bootstrap"
  trap - EXIT HUP INT TERM
  exit "$_status"
fi
