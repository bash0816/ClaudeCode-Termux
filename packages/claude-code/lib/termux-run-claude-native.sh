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
  _helper=$(mktemp "${TERMUX_TMPDIR}/claude-helper.XXXXXX.js")
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

function createFakeRequire(realRequire) {
  const realChild = realRequire('child_process');
  const realVm = realRequire('vm');

  function injectBunIntoContext(context) {
    if (!context || typeof context !== 'object') return context;
    try {
      if (!Object.prototype.hasOwnProperty.call(context, '__claudeYaml')) {
        Object.defineProperty(context, '__claudeYaml', {
          value: globalThis.__claudeYaml,
          configurable: true,
          writable: true,
        });
      }
      if (!Object.prototype.hasOwnProperty.call(context, '__claudeBunShim')) {
        Object.defineProperty(context, '__claudeBunShim', {
          value: globalThis.__claudeBunShim,
          configurable: true,
          writable: true,
        });
      }
      if (!Object.prototype.hasOwnProperty.call(context, '__claudeBun')) {
        Object.defineProperty(context, '__claudeBun', {
          value: globalThis.__claudeBunShim,
          configurable: true,
          writable: true,
        });
      }
      if (Object.prototype.hasOwnProperty.call(context, 'Bun')) {
        if (context.Bun && typeof context.Bun === 'object' && context.Bun !== globalThis.Bun) {
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
        if (!context.Bun || typeof context.Bun !== 'object') {
          Object.defineProperty(context, 'Bun', {
            value: globalThis.Bun,
            configurable: true,
            writable: true,
          });
        }
      } else {
        Object.defineProperty(context, 'Bun', {
          value: globalThis.Bun,
          configurable: true,
          writable: true,
        });
      }
      if (context.Bun && globalThis.__claudeYaml) {
        context.Bun.YAML = globalThis.__claudeYaml;
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

    if (id === 'vm' || id === 'node:vm') {
      if (!realVm.__claudeBunShimPatched) {
        const originalCreateContext = realVm.createContext.bind(realVm);
        const originalRunInNewContext = realVm.runInNewContext.bind(realVm);
        const originalRunInContext = realVm.runInContext.bind(realVm);
        const originalRunInThisContext = realVm.runInThisContext && realVm.runInThisContext.bind(realVm);
        const scriptProto = realVm.Script && realVm.Script.prototype;

        realVm.createContext = (contextObject, ...rest) =>
          originalCreateContext(injectBunIntoContext(contextObject), ...rest);
        realVm.runInNewContext = (code, contextObject, ...rest) =>
          originalRunInNewContext(code, injectBunIntoContext(contextObject), ...rest);
        realVm.runInContext = (code, contextObject, ...rest) =>
          originalRunInContext(code, injectBunIntoContext(contextObject), ...rest);
        if (originalRunInThisContext) {
          realVm.runInThisContext = (code, ...rest) => originalRunInThisContext(code, ...rest);
        }

        if (scriptProto && !scriptProto.__claudeBunShimPatched) {
          const originalScriptRunInContext = scriptProto.runInContext;
          const originalScriptRunInNewContext = scriptProto.runInNewContext;
          const originalScriptRunInThisContext = scriptProto.runInThisContext;

          scriptProto.runInContext = function (contextObject, ...rest) {
            return originalScriptRunInContext.call(this, injectBunIntoContext(contextObject), ...rest);
          };
          scriptProto.runInNewContext = function (contextObject, ...rest) {
            return originalScriptRunInNewContext.call(this, injectBunIntoContext(contextObject), ...rest);
          };
          if (originalScriptRunInThisContext) {
            scriptProto.runInThisContext = function (...rest) {
              return originalScriptRunInThisContext.call(this, ...rest);
            };
          }

          Object.defineProperty(scriptProto, '__claudeBunShimPatched', { value: true });
        }

        Object.defineProperty(realVm, '__claudeBunShimPatched', { value: true });
      }
      return realVm;
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
  const patchedCode = code.replace(
    /^function\(exports, require, module, __filename, __dirname\) \{/,
    'function(exports, require, module, __filename, __dirname) {var __claudeBun = globalThis.__claudeBunShim;',
  ).replace(
    /\btypeof Bun\b/g,
    'typeof __claudeBun',
  ).replace(
    /\bBun\./g,
    '__claudeBun.',
  ).replace(
    /function t5q\(q\)\{return Bun\.YAML\.parse\(q\)\}/g,
    'function t5q(q){return globalThis.__claudeYaml.parse(q)}',
  ).replace(
    /function VK6\(q\)\{return Bun\.YAML\.stringify\(q,null,2\)\+`/g,
    'function VK6(q){return globalThis.__claudeYaml.stringify(q,null,2)+`',
  );
  const fn = eval('(' + patchedCode.replace(/\)\s*$/, '') + ')');

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;
  const originalBun = process.versions.bun;
  const hadGlobalBun = Object.prototype.hasOwnProperty.call(globalThis, 'Bun');
  const originalGlobalBun = globalThis.Bun;
  const asyncErrors = [];

  globalThis.__claudeYaml = createYamlShim();
  if (!globalThis.__claudeBunShim || typeof globalThis.__claudeBunShim !== 'object') {
    globalThis.__claudeBunShim = {};
  }
  const fakeRequire = createFakeRequire(require);
  function onAsyncError(error) {
    asyncErrors.push(error);
  }

  try {
    process.once('uncaughtException', onAsyncError);
    process.once('unhandledRejection', onAsyncError);
    Object.defineProperty(process.versions, 'bun', { value: '1.1.8', configurable: true });
    const _realChild = require('child_process');
    globalThis.Bun = {
      version: '1.1.8',
      stringWidth,
      which: (cmd) => {
        try {
          return _realChild.execFileSync('which', [String(cmd)], { encoding: 'utf8' }).trim() || null;
        } catch { return null; }
      },
      semver: (() => {
        const _cmp = (a, b) => {
          const pa = String(a).replace(/[^0-9.]/g,'').split('.').map(Number);
          const pb = String(b).replace(/[^0-9.]/g,'').split('.').map(Number);
          for (let i = 0; i < 3; i++) { const d = (pa[i]||0)-(pb[i]||0); if (d) return d > 0 ? 1 : -1; }
          return 0;
        };
        const _satisfies = (ver, range) => {
          const s = String(range).trim();
          const m = s.match(/^([><=!]{1,2})\s*([\d]+(?:\.[\d]+){0,2})$/);
          if (m) {
            const op = m[1], c = _cmp(ver, m[2]);
            if (op === '>') return c > 0;
            if (op === '>=') return c >= 0;
            if (op === '<') return c < 0;
            if (op === '<=') return c <= 0;
            if (op === '=' || op === '==') return c === 0;
            if (op === '!=') return c !== 0;
          }
          if (/^[\d]+(?:\.[\d]+){0,2}$/.test(s)) return _cmp(ver, s) === 0;
          return false;
        };
        return {
          order: (a, b) => _cmp(a, b),
          compare: (a, b) => _cmp(a, b),
          satisfies: (ver, range) => _satisfies(ver, range),
          gt: (a, b) => _cmp(a, b) > 0,
          gte: (a, b) => _cmp(a, b) >= 0,
          lt: (a, b) => _cmp(a, b) < 0,
          lte: (a, b) => _cmp(a, b) <= 0,
          };
        })(),
        YAML: globalThis.__claudeYaml,
    };
    Object.assign(globalThis.__claudeBunShim, globalThis.Bun);
    if (typeof globalThis.__claudeBunShim.gc !== 'function') {
      globalThis.__claudeBunShim.gc = () => {};
    }
    globalThis.__claudeBun = globalThis.__claudeBunShim;
    globalThis.Bun = globalThis.__claudeBunShim;
    process.argv = ['node', extractedFile, ...argv];
    process.exit = code => {
      throw new RequestedExit(code);
    };

    const moduleLike = { exports: {} };
    const maybePromise = fn(moduleLike.exports, fakeRequire, moduleLike, extractedFile, workdir);
    if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
    await new Promise(resolve => setTimeout(resolve, 5000));
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
    delete globalThis.__claudeYaml;
    delete globalThis.__claudeBunShim;
    delete globalThis.__claudeBun;
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
  export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="${CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:-1}"
  export ENABLE_CLAUDEAI_MCP_SERVERS="${ENABLE_CLAUDEAI_MCP_SERVERS:-0}"
  export CLAUDE_CODE_SIMPLE="${CLAUDE_CODE_SIMPLE:-0}"
  node "$_helper" "$@" </dev/null
  _status=$?
  rm -f "$_helper"
  trap - EXIT HUP INT TERM
  exit "$_status"
else
  _bootstrap=$(mktemp "${TERMUX_TMPDIR}/claude-bootstrap.XXXXXX.js")
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

function createFakeRequire(realRequire) {
  const realChild = realRequire('child_process');
  const realVm = realRequire('vm');

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

    if (id === 'vm' || id === 'node:vm') {
      if (!realVm.__claudeBunShimPatched) {
        const originalCreateContext = realVm.createContext.bind(realVm);
        const originalRunInNewContext = realVm.runInNewContext.bind(realVm);
        const originalRunInContext = realVm.runInContext.bind(realVm);
        const originalRunInThisContext = realVm.runInThisContext && realVm.runInThisContext.bind(realVm);
        const scriptProto = realVm.Script && realVm.Script.prototype;

        realVm.createContext = (contextObject, ...rest) =>
          originalCreateContext(injectBunIntoContext(contextObject), ...rest);
        realVm.runInNewContext = (code, contextObject, ...rest) =>
          originalRunInNewContext(code, injectBunIntoContext(contextObject), ...rest);
        realVm.runInContext = (code, contextObject, ...rest) =>
          originalRunInContext(code, injectBunIntoContext(contextObject), ...rest);
        if (originalRunInThisContext) {
          realVm.runInThisContext = (code, ...rest) => originalRunInThisContext(code, ...rest);
        }

        if (scriptProto && !scriptProto.__claudeBunShimPatched) {
          const originalScriptRunInContext = scriptProto.runInContext;
          const originalScriptRunInNewContext = scriptProto.runInNewContext;
          const originalScriptRunInThisContext = scriptProto.runInThisContext;

          scriptProto.runInContext = function (contextObject, ...rest) {
            return originalScriptRunInContext.call(this, injectBunIntoContext(contextObject), ...rest);
          };
          scriptProto.runInNewContext = function (contextObject, ...rest) {
            return originalScriptRunInNewContext.call(this, injectBunIntoContext(contextObject), ...rest);
          };
          if (originalScriptRunInThisContext) {
            scriptProto.runInThisContext = function (...rest) {
              return originalScriptRunInThisContext.call(this, ...rest);
            };
          }

          Object.defineProperty(scriptProto, '__claudeBunShimPatched', { value: true });
        }

        Object.defineProperty(realVm, '__claudeBunShimPatched', { value: true });
      }
      return realVm;
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
  const patchedCode = code.replace(
    /^function\(exports, require, module, __filename, __dirname\) \{/,
    'function(exports, require, module, __filename, __dirname) {var __claudeBun = globalThis.__claudeBunShim;',
  ).replace(
    /\btypeof Bun\b/g,
    'typeof __claudeBun',
  ).replace(
    /\bBun\./g,
    '__claudeBun.',
  ).replace(
    /function t5q\(q\)\{return Bun\.YAML\.parse\(q\)\}/g,
    'function t5q(q){return globalThis.__claudeYaml.parse(q)}',
  ).replace(
    /function VK6\(q\)\{return Bun\.YAML\.stringify\(q,null,2\)\+`/g,
    'function VK6(q){return globalThis.__claudeYaml.stringify(q,null,2)+`',
  );
  const fn = eval('(' + patchedCode.replace(/\)\s*$/, '') + ')');

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;
  const originalBun = process.versions.bun;
  const hadGlobalBun = Object.prototype.hasOwnProperty.call(globalThis, 'Bun');
  const originalGlobalBun = globalThis.Bun;
  const asyncErrors = [];

  globalThis.__claudeYaml = createYamlShim();
  if (!globalThis.__claudeBunShim || typeof globalThis.__claudeBunShim !== 'object') {
    globalThis.__claudeBunShim = {};
  }
  const fakeRequire = createFakeRequire(require);
  function onAsyncError(error) {
    asyncErrors.push(error);
  }

  try {
    process.once('uncaughtException', onAsyncError);
    process.once('unhandledRejection', onAsyncError);
    Object.defineProperty(process.versions, 'bun', { value: '1.1.8', configurable: true });
    const _realChild = require('child_process');
    globalThis.Bun = {
      version: '1.1.8',
      stringWidth,
      which: (cmd) => {
        try {
          return _realChild.execFileSync('which', [String(cmd)], { encoding: 'utf8' }).trim() || null;
        } catch { return null; }
      },
      semver: (() => {
        const _cmp = (a, b) => {
          const pa = String(a).replace(/[^0-9.]/g,'').split('.').map(Number);
          const pb = String(b).replace(/[^0-9.]/g,'').split('.').map(Number);
          for (let i = 0; i < 3; i++) { const d = (pa[i]||0)-(pb[i]||0); if (d) return d > 0 ? 1 : -1; }
          return 0;
        };
        const _satisfies = (ver, range) => {
          const s = String(range).trim();
          const m = s.match(/^([><=!]{1,2})\s*([\d]+(?:\.[\d]+){0,2})$/);
          if (m) {
            const op = m[1], c = _cmp(ver, m[2]);
            if (op === '>') return c > 0;
            if (op === '>=') return c >= 0;
            if (op === '<') return c < 0;
            if (op === '<=') return c <= 0;
            if (op === '=' || op === '==') return c === 0;
            if (op === '!=') return c !== 0;
          }
          if (/^[\d]+(?:\.[\d]+){0,2}$/.test(s)) return _cmp(ver, s) === 0;
          return false;
        };
        return {
          order: (a, b) => _cmp(a, b),
          compare: (a, b) => _cmp(a, b),
          satisfies: (ver, range) => _satisfies(ver, range),
          gt: (a, b) => _cmp(a, b) > 0,
          gte: (a, b) => _cmp(a, b) >= 0,
          lt: (a, b) => _cmp(a, b) < 0,
          lte: (a, b) => _cmp(a, b) <= 0,
        };
        })(),
        YAML: globalThis.__claudeYaml,
    };
    Object.assign(globalThis.__claudeBunShim, globalThis.Bun);
    if (typeof globalThis.__claudeBunShim.gc !== 'function') {
      globalThis.__claudeBunShim.gc = () => {};
    }
    globalThis.__claudeBun = globalThis.__claudeBunShim;
    globalThis.Bun = globalThis.__claudeBunShim;
    process.argv = ['node', extractedFile, ...argv];
    process.exit = code => {
      throw new RequestedExit(code);
    };

    const moduleLike = { exports: {} };
    const maybePromise = fn(moduleLike.exports, fakeRequire, moduleLike, extractedFile, workdir);
    if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
    const _waitMs = Number(process.env.CLAUDE_TERMUX_PRINT_WAIT_MS || 200);
    await new Promise(resolve => setTimeout(resolve, _waitMs));
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
    delete globalThis.__claudeYaml;
    delete globalThis.__claudeBunShim;
    delete globalThis.__claudeBun;
    if (hadGlobalBun) globalThis.Bun = originalGlobalBun;
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
  export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="${CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:-1}"
  export ENABLE_CLAUDEAI_MCP_SERVERS="${ENABLE_CLAUDEAI_MCP_SERVERS:-0}"
  node "$_bootstrap" "$@"
  _status=$?
  rm -f "$_bootstrap"
  trap - EXIT HUP INT TERM
  exit "$_status"
fi
