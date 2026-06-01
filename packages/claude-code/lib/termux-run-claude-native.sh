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

const ansiPattern =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:;[-a-zA-Z\d\/\#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\/\#&.:=?%@~_]*)*)?(?:\u0007|\u001B\u005C|\u009C)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const ansiPatternSingle = new RegExp(ansiPattern.source);
const debugBunShim = process.env.CLAUDE_TERMUX_DEBUG_BUN_SHIM === '1';

function stripANSI(text) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return text.replace(ansiPattern, '');
}

function codePointWidth(codePoint) {
  if (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x300 && codePoint <= 0x36f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    codePoint === 0xfeff ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  ) {
    return 0;
  }

  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2329 && codePoint <= 0x232a) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faf8) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  ) {
    return 2;
  }

  return 1;
}

function stringWidth(value) {
  const text = stripANSI(typeof value === 'string' ? value : String(value ?? ''));
  let width = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    width += codePointWidth(codePoint);
  }
  return width;
}

function toHashBytes(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return Buffer.from(String(value ?? ''));
}

function hashValue(value, seed = 0) {
  const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
  const FNV_PRIME_64 = 0x100000001b3n;
  const MASK_64 = 0xffffffffffffffffn;

  const seedNumber = typeof seed === 'bigint' ? Number(seed) : Number(seed);
  const seedValue = Number.isFinite(seedNumber) ? Math.trunc(seedNumber) : 0;
  let result = BigInt.asUintN(64, FNV_OFFSET_BASIS_64 ^ BigInt(seedValue));

  const bytes = toHashBytes(value);
  for (const byte of bytes) {
    result ^= BigInt(byte);
    result = (result * FNV_PRIME_64) & MASK_64;
  }

  return BigInt(result);
}

function which(cmd) {
  const fs = require('fs');
  const path = require('path');

  if (typeof cmd !== 'string' || cmd.length === 0) return null;

  const isExecutable = candidate => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const stat = fs.statSync(candidate);
      return stat.isFile();
    } catch {
      return false;
    }
  };

  if (cmd.includes(path.sep)) {
    return isExecutable(cmd) ? path.resolve(cmd) : null;
  }

  const searchPath = process.env.PATH || '';
  for (const entry of searchPath.split(path.delimiter)) {
    if (!entry) continue;
    const candidate = path.join(entry, cmd);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function wrapAnsi(str, columns, options) {
  const input = typeof str === 'string' ? str : String(str ?? '');
  const widthLimit = Number(columns);
  if (!Number.isFinite(widthLimit) || widthLimit <= 0) return input;

  const wordWrap = !options || options.wordWrap !== false;
  const hard = !!(options && options.hard);

  if (!wordWrap || hard) {
    const result = [];
    let width = 0;

    for (let i = 0; i < input.length; ) {
      const char = input[i];

      if (char === '\u001b' || char === '\u009b') {
        const match = input.slice(i).match(ansiPatternSingle);
        if (match && match.index === 0) {
          result.push(match[0]);
          i += match[0].length;
          continue;
        }
      }

      if (char === '\n') {
        result.push(char);
        width = 0;
        i += 1;
        continue;
      }

      const codePoint = input.codePointAt(i);
      const charText = String.fromCodePoint(codePoint);
      const charWidth = codePointWidth(codePoint);

      if (width > 0 && width + charWidth > widthLimit) {
        result.push('\n');
        width = 0;
      }

      result.push(charText);
      width += charWidth;
      i += charText.length;
    }

    return result.join('');
  }

  const result = [];
  let line = '';
  let lineWidth = 0;
  let pendingSpaces = '';

  for (let i = 0; i < input.length; ) {
    const char = input[i];

    if (char === '\u001b' || char === '\u009b') {
      const match = input.slice(i).match(ansiPatternSingle);
      if (match && match.index === 0) {
        line += match[0];
        i += match[0].length;
        continue;
      }
    }

    if (char === '\n') {
      if (line.length > 0) result.push(line);
      result.push('\n');
      line = '';
      lineWidth = 0;
      pendingSpaces = '';
      i += 1;
      continue;
    }

    const codePoint = input.codePointAt(i);
    const charText = String.fromCodePoint(codePoint);
    if (charText === ' ' || charText === '\t') {
      pendingSpaces += charText;
      i += charText.length;
      continue;
    }

    let end = i + charText.length;
    while (end < input.length) {
      const nextChar = input[end];
      if (nextChar === '\n' || nextChar === ' ' || nextChar === '\t' || nextChar === '\u001b' || nextChar === '\u009b') {
        break;
      }
      const nextCodePoint = input.codePointAt(end);
      end += String.fromCodePoint(nextCodePoint).length;
    }

    const text = input.slice(i, end);
    const textWidth = stringWidth(text);
    const pendingWidth = pendingSpaces ? stringWidth(pendingSpaces) : 0;

    if (lineWidth > 0 && lineWidth + pendingWidth + textWidth > widthLimit) {
      result.push(line);
      result.push('\n');
      line = '';
      lineWidth = 0;
      pendingSpaces = '';
    }

    if (lineWidth > 0 && pendingSpaces) {
      line += pendingSpaces;
      lineWidth += pendingWidth;
    }
    pendingSpaces = '';

    line += text;
    lineWidth += textWidth;
    i = end;
  }

  if (pendingSpaces && lineWidth > 0) {
    line += pendingSpaces;
  }
  if (line.length > 0) result.push(line);

  return result.join('');
}

const YAML = {
  parse(text) {
    try {
      const lines = String(text).split('\n');
      const result = {};
      for (const line of lines) {
        const m = line.match(/^([^:#]+):\s*(.*)$/);
        if (m) result[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return result;
    } catch { return {}; }
  },
  stringify(obj) {
    try {
      return Object.entries(obj || {}).map(([k, v]) => k + ': ' + v).join('\n') + '\n';
    } catch { return ''; }
  },
};

function parseSemverVersion(value) {
  const text = String(value ?? '').trim().replace(/^[v=]/, '');
  const match = text.match(/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
  if (!match) return null;
  return {
    parts: [match[1], match[2] ?? '0', match[3] ?? '0'].map(Number),
    pre: match[4] ? match[4].split('.') : null,
  };
}

function comparePrerelease(a, b) {
  const size = Math.max(a.length, b.length);
  for (let i = 0; i < size; i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const aNum = /^\d+$/.test(a[i]);
    const bNum = /^\d+$/.test(b[i]);
    if (aNum && bNum) { const d = Number(a[i]) - Number(b[i]); if (d) return d < 0 ? -1 : 1; }
    else if (aNum) return -1;
    else if (bNum) return 1;
    else if (a[i] < b[i]) return -1;
    else if (a[i] > b[i]) return 1;
  }
  return 0;
}

const semver = {
  order(left, right) {
    const a = parseSemverVersion(left), b = parseSemverVersion(right);
    if (!a || !b) return NaN;
    for (let i = 0; i < 3; i++) {
      const d = a.parts[i] - b.parts[i];
      if (d) return d < 0 ? -1 : 1;
    }
    if (a.pre && !b.pre) return -1;
    if (!a.pre && b.pre) return 1;
    if (a.pre && b.pre) return comparePrerelease(a.pre, b.pre);
    return 0;
  },
  satisfies(version, range) {
    if (!version || !range) return false;
    const v = String(version).replace(/^[v=]/, '');
    const clean = String(range).trim();
    if (!clean) return false;
    if (clean.includes('||')) return clean.split('||').some(r => semver.satisfies(v, r.trim()));
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return parts.every(p => semver.satisfies(v, p));
    const caret = clean.match(/^\^([0-9].*)$/);
    if (caret) {
      const p = parseSemverVersion(caret[1]);
      if (!p) return false;
      const upper = p.parts[0] > 0 ? (p.parts[0] + 1) + '.0.0'
        : p.parts[1] > 0 ? '0.' + (p.parts[1] + 1) + '.0'
        : '0.0.' + (p.parts[2] + 1);
      return semver.satisfies(v, '>=' + caret[1]) && semver.satisfies(v, '<' + upper);
    }
    const tilde = clean.match(/^~([0-9].*)$/);
    if (tilde) {
      const p = parseSemverVersion(tilde[1]);
      if (!p) return false;
      const original = tilde[1].split('.');
      const upper = original.length >= 2
        ? p.parts[0] + '.' + (p.parts[1] + 1) + '.0'
        : (p.parts[0] + 1) + '.0.0';
      return semver.satisfies(v, '>=' + tilde[1]) && semver.satisfies(v, '<' + upper);
    }
    const m = clean.match(/^([><=!]{1,2})\s*([0-9].*)$/);
    if (m) {
      const cmp = semver.order(v, m[2]);
      if (!Number.isFinite(cmp)) return false;
      return m[1] === '>=' ? cmp >= 0 : m[1] === '>' ? cmp > 0 :
             m[1] === '<=' ? cmp <= 0 : m[1] === '<' ? cmp < 0 :
             m[1] === '=' || m[1] === '==' ? cmp === 0 : m[1] === '!=' ? cmp !== 0 : false;
    }
    const exact = parseSemverVersion(clean);
    return exact ? semver.order(v, clean) === 0 : false;
  },
};


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
    const BunShim = {
      version: '1.1.8',
      stringWidth,
      hash: hashValue,
      which,
      wrapAnsi,
      stripANSI,
      semver,
      YAML,
      gc: (sync) => {
        try {
          if (typeof global.gc === 'function') global.gc(sync === false ? false : true);
        } catch {}
      },
      stdin: { stream: null },
      embeddedFiles: [],
    };
    const BunProxy = new Proxy(BunShim, {
      get(target, key, receiver) {
        if (!(key in target) && typeof key !== 'symbol' && debugBunShim) {
          console.error('[BunShim missing]', key);
        }
        return Reflect.get(target, key, receiver);
      },
    });
    globalThis.Bun = BunProxy;

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

main().then(() => {
  process.exit(process.exitCode ?? 0);
}).catch(error => {
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
  exec node - "$@" <<'NODE'
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

const ansiPattern =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:;[-a-zA-Z\d\/\#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\/\#&.:=?%@~_]*)*)?(?:\u0007|\u001B\u005C|\u009C)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const ansiPatternSingle = new RegExp(ansiPattern.source);
const debugBunShim = process.env.CLAUDE_TERMUX_DEBUG_BUN_SHIM === '1';

function stripANSI(text) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return text.replace(ansiPattern, '');
}

function codePointWidth(codePoint) {
  if (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x300 && codePoint <= 0x36f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    codePoint === 0xfeff ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  ) {
    return 0;
  }

  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2329 && codePoint <= 0x232a) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faf8) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  ) {
    return 2;
  }

  return 1;
}

function stringWidth(value) {
  const text = stripANSI(typeof value === 'string' ? value : String(value ?? ''));
  let width = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    width += codePointWidth(codePoint);
  }
  return width;
}

function toHashBytes(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return Buffer.from(String(value ?? ''));
}

function hashValue(value, seed = 0) {
  const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
  const FNV_PRIME_64 = 0x100000001b3n;
  const MASK_64 = 0xffffffffffffffffn;

  const seedNumber = typeof seed === 'bigint' ? Number(seed) : Number(seed);
  const seedValue = Number.isFinite(seedNumber) ? Math.trunc(seedNumber) : 0;
  let result = BigInt.asUintN(64, FNV_OFFSET_BASIS_64 ^ BigInt(seedValue));

  const bytes = toHashBytes(value);
  for (const byte of bytes) {
    result ^= BigInt(byte);
    result = (result * FNV_PRIME_64) & MASK_64;
  }

  return BigInt(result);
}

function which(cmd) {
  const fs = require('fs');
  const path = require('path');

  if (typeof cmd !== 'string' || cmd.length === 0) return null;

  const isExecutable = candidate => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const stat = fs.statSync(candidate);
      return stat.isFile();
    } catch {
      return false;
    }
  };

  if (cmd.includes(path.sep)) {
    return isExecutable(cmd) ? path.resolve(cmd) : null;
  }

  const searchPath = process.env.PATH || '';
  for (const entry of searchPath.split(path.delimiter)) {
    if (!entry) continue;
    const candidate = path.join(entry, cmd);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function wrapAnsi(str, columns, options) {
  const input = typeof str === 'string' ? str : String(str ?? '');
  const widthLimit = Number(columns);
  if (!Number.isFinite(widthLimit) || widthLimit <= 0) return input;

  const wordWrap = !options || options.wordWrap !== false;
  const hard = !!(options && options.hard);

  if (!wordWrap || hard) {
    const result = [];
    let width = 0;

    for (let i = 0; i < input.length; ) {
      const char = input[i];

      if (char === '\u001b' || char === '\u009b') {
        const match = input.slice(i).match(ansiPatternSingle);
        if (match && match.index === 0) {
          result.push(match[0]);
          i += match[0].length;
          continue;
        }
      }

      if (char === '\n') {
        result.push(char);
        width = 0;
        i += 1;
        continue;
      }

      const codePoint = input.codePointAt(i);
      const charText = String.fromCodePoint(codePoint);
      const charWidth = codePointWidth(codePoint);

      if (width > 0 && width + charWidth > widthLimit) {
        result.push('\n');
        width = 0;
      }

      result.push(charText);
      width += charWidth;
      i += charText.length;
    }

    return result.join('');
  }

  const result = [];
  let line = '';
  let lineWidth = 0;
  let pendingSpaces = '';

  for (let i = 0; i < input.length; ) {
    const char = input[i];

    if (char === '\u001b' || char === '\u009b') {
      const match = input.slice(i).match(ansiPatternSingle);
      if (match && match.index === 0) {
        line += match[0];
        i += match[0].length;
        continue;
      }
    }

    if (char === '\n') {
      if (line.length > 0) result.push(line);
      result.push('\n');
      line = '';
      lineWidth = 0;
      pendingSpaces = '';
      i += 1;
      continue;
    }

    const codePoint = input.codePointAt(i);
    const charText = String.fromCodePoint(codePoint);
    if (charText === ' ' || charText === '\t') {
      pendingSpaces += charText;
      i += charText.length;
      continue;
    }

    let end = i + charText.length;
    while (end < input.length) {
      const nextChar = input[end];
      if (nextChar === '\n' || nextChar === ' ' || nextChar === '\t' || nextChar === '\u001b' || nextChar === '\u009b') {
        break;
      }
      const nextCodePoint = input.codePointAt(end);
      end += String.fromCodePoint(nextCodePoint).length;
    }

    const text = input.slice(i, end);
    const textWidth = stringWidth(text);
    const pendingWidth = pendingSpaces ? stringWidth(pendingSpaces) : 0;

    if (lineWidth > 0 && lineWidth + pendingWidth + textWidth > widthLimit) {
      result.push(line);
      result.push('\n');
      line = '';
      lineWidth = 0;
      pendingSpaces = '';
    }

    if (lineWidth > 0 && pendingSpaces) {
      line += pendingSpaces;
      lineWidth += pendingWidth;
    }
    pendingSpaces = '';

    line += text;
    lineWidth += textWidth;
    i = end;
  }

  if (pendingSpaces && lineWidth > 0) {
    line += pendingSpaces;
  }
  if (line.length > 0) result.push(line);

  return result.join('');
}

const YAML = {
  parse(text) {
    try {
      const lines = String(text).split('\n');
      const result = {};
      for (const line of lines) {
        const m = line.match(/^([^:#]+):\s*(.*)$/);
        if (m) result[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return result;
    } catch { return {}; }
  },
  stringify(obj) {
    try {
      return Object.entries(obj || {}).map(([k, v]) => k + ': ' + v).join('\n') + '\n';
    } catch { return ''; }
  },
};

function parseSemverVersion(value) {
  const text = String(value ?? '').trim().replace(/^[v=]/, '');
  const match = text.match(/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
  if (!match) return null;
  return {
    parts: [match[1], match[2] ?? '0', match[3] ?? '0'].map(Number),
    pre: match[4] ? match[4].split('.') : null,
  };
}

function comparePrerelease(a, b) {
  const size = Math.max(a.length, b.length);
  for (let i = 0; i < size; i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const aNum = /^\d+$/.test(a[i]);
    const bNum = /^\d+$/.test(b[i]);
    if (aNum && bNum) { const d = Number(a[i]) - Number(b[i]); if (d) return d < 0 ? -1 : 1; }
    else if (aNum) return -1;
    else if (bNum) return 1;
    else if (a[i] < b[i]) return -1;
    else if (a[i] > b[i]) return 1;
  }
  return 0;
}

const semver = {
  order(left, right) {
    const a = parseSemverVersion(left), b = parseSemverVersion(right);
    if (!a || !b) return NaN;
    for (let i = 0; i < 3; i++) {
      const d = a.parts[i] - b.parts[i];
      if (d) return d < 0 ? -1 : 1;
    }
    if (a.pre && !b.pre) return -1;
    if (!a.pre && b.pre) return 1;
    if (a.pre && b.pre) return comparePrerelease(a.pre, b.pre);
    return 0;
  },
  satisfies(version, range) {
    if (!version || !range) return false;
    const v = String(version).replace(/^[v=]/, '');
    const clean = String(range).trim();
    if (!clean) return false;
    if (clean.includes('||')) return clean.split('||').some(r => semver.satisfies(v, r.trim()));
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return parts.every(p => semver.satisfies(v, p));
    const caret = clean.match(/^\^([0-9].*)$/);
    if (caret) {
      const p = parseSemverVersion(caret[1]);
      if (!p) return false;
      const upper = p.parts[0] > 0 ? (p.parts[0] + 1) + '.0.0'
        : p.parts[1] > 0 ? '0.' + (p.parts[1] + 1) + '.0'
        : '0.0.' + (p.parts[2] + 1);
      return semver.satisfies(v, '>=' + caret[1]) && semver.satisfies(v, '<' + upper);
    }
    const tilde = clean.match(/^~([0-9].*)$/);
    if (tilde) {
      const p = parseSemverVersion(tilde[1]);
      if (!p) return false;
      const original = tilde[1].split('.');
      const upper = original.length >= 2
        ? p.parts[0] + '.' + (p.parts[1] + 1) + '.0'
        : (p.parts[0] + 1) + '.0.0';
      return semver.satisfies(v, '>=' + tilde[1]) && semver.satisfies(v, '<' + upper);
    }
    const m = clean.match(/^([><=!]{1,2})\s*([0-9].*)$/);
    if (m) {
      const cmp = semver.order(v, m[2]);
      if (!Number.isFinite(cmp)) return false;
      return m[1] === '>=' ? cmp >= 0 : m[1] === '>' ? cmp > 0 :
             m[1] === '<=' ? cmp <= 0 : m[1] === '<' ? cmp < 0 :
             m[1] === '=' || m[1] === '==' ? cmp === 0 : m[1] === '!=' ? cmp !== 0 : false;
    }
    const exact = parseSemverVersion(clean);
    return exact ? semver.order(v, clean) === 0 : false;
  },
};


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
    const BunShim = {
      version: '1.1.8',
      stringWidth,
      hash: hashValue,
      which,
      wrapAnsi,
      stripANSI,
      semver,
      YAML,
      gc: (sync) => {
        try {
          if (typeof global.gc === 'function') global.gc(sync === false ? false : true);
        } catch {}
      },
      stdin: { stream: null },
      embeddedFiles: [],
    };
    const BunProxy = new Proxy(BunShim, {
      get(target, key, receiver) {
        if (!(key in target) && typeof key !== 'symbol' && debugBunShim) {
          console.error('[BunShim missing]', key);
        }
        return Reflect.get(target, key, receiver);
      },
    });
    globalThis.Bun = BunProxy;

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

main().then(() => {
  process.exit(process.exitCode ?? 0);
}).catch(error => {
  if (error && error.code === 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED') {
    console.error(BLOCK_MESSAGE);
    process.exit(error.status || 1);
  }
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
NODE
fi
