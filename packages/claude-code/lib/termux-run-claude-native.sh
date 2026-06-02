#!/usr/bin/env sh
set -eu

SOURCE_BIN="${SOURCE_BIN:?SOURCE_BIN is required}"
WORKDIR="${WORKDIR:-${HOME}/.claude-termux-native-package/launcher-workdir}"
ENTRY_JS_OFFSET="${ENTRY_JS_OFFSET:?ENTRY_JS_OFFSET is required}"
ENTRY_END_OFFSET="${ENTRY_END_OFFSET:?ENTRY_END_OFFSET is required}"
CURRENT_CLAUDE_VERSION="${CURRENT_CLAUDE_VERSION:?CURRENT_CLAUDE_VERSION is required}"
CLAUDE_TERMUX_PACKAGE_DIR="${CLAUDE_TERMUX_PACKAGE_DIR:-}"
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
export CLAUDE_TERMUX_PACKAGE_DIR
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="${CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:-1}"
export ENABLE_CLAUDEAI_MCP_SERVERS="${ENABLE_CLAUDEAI_MCP_SERVERS:-0}"

node - "$@" <<'NODE'
const fs = require('fs');
const path = require('path');

const sourceBin = process.env.SOURCE_BIN;
const workdir = process.env.WORKDIR;
const entryJsOffset = Number(process.env.ENTRY_JS_OFFSET);
const entryEndOffset = Number(process.env.ENTRY_END_OFFSET);
const argv = process.argv.slice(2);
const packageDir = process.env.CLAUDE_TERMUX_PACKAGE_DIR || '';

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

function stripANSI(text) {
  return String(text ?? '').replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -\/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\))/g, '');
}

function wrapAnsi(text, columns) {
  const value = String(text ?? '');
  const width = Number(columns);
  if (!Number.isFinite(width) || width <= 0) return value;

  let lineWidth = 0;
  let result = '';
  for (const ch of value) {
    if (ch === '\n') {
      result += ch;
      lineWidth = 0;
      continue;
    }

    const chWidth = stringWidth(ch);
    if (lineWidth > 0 && lineWidth + chWidth > width) {
      result += '\n';
      lineWidth = 0;
    }

    result += ch;
    lineWidth += chWidth;
  }
  return result;
}

function hash(value) {
  const crypto = require('crypto');
  const digest = crypto.createHash('sha256').update(String(value ?? '')).digest();
  return digest.readUInt32LE(0);
}

function compareSemver(left, right) {
  const a = String(left).replace(/^[^0-9]*/, '').split('.').map(Number);
  const b = String(right).replace(/^[^0-9]*/, '').split('.').map(Number);
  const size = Math.max(a.length, b.length);
  for (let i = 0; i < size; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function satisfiesSemver(version, range) {
  const cleanRange = String(range ?? '').trim();
  const match = cleanRange.match(/^([><=!]{1,2})\s*([0-9][^\s]*)$/);
  if (!match) {
    return /^[0-9]+(?:\.[0-9]+){0,2}$/.test(cleanRange)
      ? compareSemver(version, cleanRange) === 0
      : true;
  }

  const [, op, target] = match;
  const cmp = compareSemver(version, target);
  if (op === '>') return cmp > 0;
  if (op === '>=') return cmp >= 0;
  if (op === '<') return cmp < 0;
  if (op === '<=') return cmp <= 0;
  if (op === '=' || op === '==') return cmp === 0;
  if (op === '!=') return cmp !== 0;
  return true;
}

function createSemverShim() {
  return {
    order: compareSemver,
    compare: compareSemver,
    satisfies: satisfiesSemver,
    gt: (left, right) => compareSemver(left, right) > 0,
    gte: (left, right) => compareSemver(left, right) >= 0,
    lt: (left, right) => compareSemver(left, right) < 0,
    lte: (left, right) => compareSemver(left, right) <= 0,
  };
}

function parseScalar(value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return Number(text);
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseInlineArray(value) {
  const inner = String(value ?? '').trim().slice(1, -1).trim();
  if (inner === '') return [];
  const items = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote) {
      if (ch === quote && inner[i - 1] !== '\\') quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ',') {
      items.push(parseScalar(current));
      current = '';
      continue;
    }
    current += ch;
  }

  if (current !== '') items.push(parseScalar(current));
  return items;
}

function yamlParse(text) {
  const source = String(text ?? '');
  const result = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    if (!key) continue;
    result[key] = rawValue.startsWith('[') && rawValue.endsWith(']')
      ? parseInlineArray(rawValue)
      : parseScalar(rawValue);
  }
  return result;
}

function yamlStringify(value) {
  if (!value || typeof value !== 'object') return String(value ?? '');
  const lines = [];
  for (const [key, raw] of Object.entries(value)) {
    if (Array.isArray(raw)) {
      lines.push(`${key}: [${raw.map(item => JSON.stringify(String(item))).join(', ')}]`);
    } else if (raw === null) {
      lines.push(`${key}: null`);
    } else if (typeof raw === 'string') {
      lines.push(`${key}: ${JSON.stringify(raw)}`);
    } else {
      lines.push(`${key}: ${String(raw)}`);
    }
  }
  return lines.join('\n');
}

function createYamlShim() {
  const yaml = {
    parse: yamlParse,
    stringify: yamlStringify,
  };
  yaml.YAML = yaml;
  yaml.default = yaml;
  return yaml;
}

function loadNativeUpdateGuard() {
  if (!packageDir) return null;
  const guardPath = path.join(packageDir, 'lib', 'native-update-guard.js');
  if (!fs.existsSync(guardPath)) return null;
  try {
    return require(guardPath);
  } catch {
    return null;
  }
}

const _nativeUpdateGuard = loadNativeUpdateGuard();

function createFakeRequire(realRequire) {
  const realChild = realRequire('child_process');
  const realVm = realRequire('vm');
  const guard = _nativeUpdateGuard;

  function injectBunIntoContext(context) {
    if (!context || typeof context !== 'object') return context;
    try {
      if (!Object.prototype.hasOwnProperty.call(context, '__claudeBunShim')) {
        Object.defineProperty(context, '__claudeBunShim', {
          value: globalThis.__claudeBunShim,
          configurable: true,
          writable: true,
        });
      }
      if (!Object.prototype.hasOwnProperty.call(context, '__claudeYaml')) {
        Object.defineProperty(context, '__claudeYaml', {
          value: globalThis.__claudeYaml,
          configurable: true,
          writable: true,
        });
      }
      if (Object.prototype.hasOwnProperty.call(context, 'Bun')) {
        if (!context.Bun || typeof context.Bun !== 'object' || context.Bun !== globalThis.Bun) {
          try {
            context.Bun = globalThis.Bun;
          } catch {
            Object.defineProperty(context, 'Bun', {
              value: globalThis.Bun,
              configurable: true,
              writable: true,
            });
          }
        }
      } else {
        Object.defineProperty(context, 'Bun', {
          value: globalThis.Bun,
          configurable: true,
          writable: true,
        });
      }
    } catch {}
    return context;
  }

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

  function makeChildProxy(base) {
    return {
      spawn: (...args) => base.spawn(...rewriteArgs(args)),
      execFile: (...args) => base.execFile(...args),
      exec: (...args) => base.exec(...args),
      spawnSync: (...args) => base.spawnSync(...rewriteArgs(args)),
      execFileSync: (...args) => base.execFileSync(...args),
      execSync: (...args) => base.execSync(...args),
    };
  }

  const guardedChild = guard
    ? guard.createGuardedChildProcess(makeChildProxy(realChild), v => process.stderr.write(v))
    : makeChildProxy(realChild);

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

    if (id === 'vm') {
      if (!realVm.__bunShimPatched) {
        const originalCreateContext = realVm.createContext.bind(realVm);
        const originalRunInNewContext = realVm.runInNewContext.bind(realVm);
        const ScriptProto = realVm.Script && realVm.Script.prototype;

        realVm.createContext = (contextObject, ...rest) =>
          originalCreateContext(injectBunIntoContext(contextObject), ...rest);
        realVm.runInNewContext = (code, contextObject, ...rest) =>
          originalRunInNewContext(code, injectBunIntoContext(contextObject), ...rest);

        if (ScriptProto && !ScriptProto.__bunShimPatched) {
          const originalRunInContext = ScriptProto.runInContext;
          const origRunInNew = ScriptProto.runInNewContext;
          ScriptProto.runInContext = function (contextObject, ...rest) {
            return originalRunInContext.call(this, injectBunIntoContext(contextObject), ...rest);
          };
          ScriptProto.runInNewContext = function (contextObject, ...rest) {
            return origRunInNew.call(this, injectBunIntoContext(contextObject), ...rest);
          };
          Object.defineProperty(ScriptProto, '__bunShimPatched', { value: true });
        }

        Object.defineProperty(realVm, '__bunShimPatched', { value: true });
      }
      return realVm;
    }

    if (id === 'node:vm') {
      return realVm;
    }

    if (id === 'child_process' || id === 'node:child_process') {
      return guardedChild;
    }

    if (id === 'yaml' || id === 'yamljs' || id === 'js-yaml') {
      return createYamlShim();
    }

    if (id.startsWith('/$bunfs/root/')) {
      throw new Error('bunfs require blocked: ' + id);
    }

    return realRequire(id);
  };
}

async function main() {
  const extractedFile = ensureEntryFile();
  let code = fs.readFileSync(extractedFile, 'utf8');
  globalThis.__claudeYaml = createYamlShim();
  if (!globalThis.__claudeBunShim || typeof globalThis.__claudeBunShim !== 'object') {
    globalThis.__claudeBunShim = {};
  }
  code = code.replace(
    /^function\(exports, require, module, __filename, __dirname\) \{/,
    'function(exports, require, module, __filename, __dirname) {const Bun = globalThis.__claudeBunShim;',
  );
  const patchedCode = code
    .replace(
      /function t5q\(q\)\{return Bun\.YAML\.parse\(q\)\}/g,
      'function t5q(q){return globalThis.__claudeYaml.parse(q)}',
    )
    .replace(
      /function VK6\(q\)\{return Bun\.YAML\.stringify\(q,null,2\)\+`/g,
      'function VK6(q){return globalThis.__claudeYaml.stringify(q,null,2)+`',
    );
  if (patchedCode !== code) {
    fs.writeFileSync(extractedFile, patchedCode);
  }
  code = patchedCode;
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
    globalThis.Bun = {
      version: '1.1.8',
      hash,
      stripANSI,
      YAML: createYamlShim(),
      stringWidth,
      which: cmd => {
        try {
          return require('child_process').execFileSync('which', [String(cmd)], { encoding: 'utf8' }).trim() || null;
        } catch {
          return null;
        }
      },
      wrapAnsi,
      semver: createSemverShim(),
    };
    Object.assign(globalThis.__claudeBunShim, globalThis.Bun);
    globalThis.Bun = globalThis.__claudeBunShim;
    process.argv = ['node', extractedFile, ...argv];
    process.exit = code => {
      throw new RequestedExit(code);
    };

    const moduleLike = { exports: {} };
    const maybePromise = fn(moduleLike.exports, fakeRequire, moduleLike, extractedFile, workdir);
    if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
    await new Promise(resolve => setTimeout(resolve, Number(process.env.CLAUDE_TERMUX_PRINT_WAIT_MS || 1000)));
    if (asyncErrors.length > 0) throw asyncErrors[0];
  } catch (error) {
    if (_nativeUpdateGuard && error && error.code === 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED') {
      console.error(_nativeUpdateGuard.BLOCK_MESSAGE);
      process.exit(error.status || 1);
    }
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
    delete globalThis.__claudeYaml;
    delete globalThis.__claudeBunShim;
    delete globalThis.Bun;
    if (hadGlobalBun) globalThis.Bun = originalGlobalBun;
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
NODE
