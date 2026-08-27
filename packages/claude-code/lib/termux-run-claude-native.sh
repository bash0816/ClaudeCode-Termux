#!/usr/bin/env sh
set -eu

SOURCE_BIN="${SOURCE_BIN:?SOURCE_BIN is required}"
WORKDIR="${WORKDIR:-${HOME}/.claude-termux-native-package/launcher-workdir}"
ENTRY_FORMAT="${ENTRY_FORMAT:-legacy-cjs}"
if [ "${ENTRY_FORMAT}" = "esm-chunked" ]; then
  ENTRY_JS_OFFSET="${ENTRY_JS_OFFSET:-0}"
  ENTRY_END_OFFSET="${ENTRY_END_OFFSET:-0}"
else
  ENTRY_JS_OFFSET="${ENTRY_JS_OFFSET:?ENTRY_JS_OFFSET is required}"
  ENTRY_END_OFFSET="${ENTRY_END_OFFSET:?ENTRY_END_OFFSET is required}"
fi
CURRENT_CLAUDE_VERSION="${CURRENT_CLAUDE_VERSION:?CURRENT_CLAUDE_VERSION is required}"
CLAUDE_TERMUX_PACKAGE_DIR="${CLAUDE_TERMUX_PACKAGE_DIR:?CLAUDE_TERMUX_PACKAGE_DIR is required}"
TERMUX_TMPDIR="${TMPDIR:-/data/data/com.termux/files/usr/tmp}"
SSL_CERT_DIR="${SSL_CERT_DIR:-/data/data/com.termux/files/usr/etc/tls}"
SSL_CERT_FILE="${SSL_CERT_FILE:-/data/data/com.termux/files/usr/etc/tls/cert.pem}"
DISABLE_AUTOUPDATER="${DISABLE_AUTOUPDATER:-1}"
NODE="${MAGI_NODE:-node}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

if ! "$NODE" --version >/dev/null 2>&1; then
  echo "Missing required node: ${NODE}" >&2
  exit 1
fi
if [ -z "${MAGI_ENV:-}" ]; then
  need_cmd termux-open-url
else
  command -v termux-open-url >/dev/null 2>&1 \
    || echo "[claude-code] termux-open-url not found; URL opening unavailable" >&2
fi

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
export ENTRY_FORMAT
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

_tui=0
if [ "$_pf" = "0" ] && [ -t 0 ]; then
  _tui=1
fi

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

function isStreamJsonPrintMode(argv) {
  const dashDashIndex = argv.indexOf('--');
  const ownArgs = dashDashIndex === -1 ? argv : argv.slice(0, dashDashIndex);
  const hasPrintFlag = ownArgs.includes('-p') || ownArgs.includes('--print');
  let hasStreamJsonFormat = false;
  for (let i = 0; i < ownArgs.length; i++) {
    const tok = ownArgs[i];
    if (tok === '--output-format=stream-json') { hasStreamJsonFormat = true; break; }
    if (tok === '--output-format' && ownArgs[i + 1] === 'stream-json') {
      hasStreamJsonFormat = true;
      break;
    }
  }
  return hasPrintFlag && hasStreamJsonFormat;
}

class RequestedExit extends Error {
  constructor(code) {
    super(`process.exit ${code}`);
    this.name = 'RequestedExit';
    this.code = code;
  }
}

function cleanupStaleEntryFiles(currentWorkdir = workdir, currentEntryJsOffset = entryJsOffset, currentEntryEndOffset = entryEndOffset, now = Date.now()) {
  const prefix = `cli.${currentEntryJsOffset}.${currentEntryEndOffset}.`;
  const suffix = '.bare-path.js';
  const maxAgeMs = 24 * 60 * 60 * 1000;
  let entries;
  try {
    entries = fs.readdirSync(currentWorkdir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    if (!entry.name.startsWith(prefix) || !entry.name.endsWith(suffix)) continue;
    const filePath = path.join(currentWorkdir, entry.name);
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (Number.isFinite(stats.mtimeMs) && now - stats.mtimeMs < maxAgeMs) continue;
    try {
      fs.rmSync(filePath, { force: true });
    } catch {}
  }
}

function ensureEntryFile() {
  cleanupStaleEntryFiles();
  const extractedFile = path.join(
    workdir,
    `cli.${entryJsOffset}.${entryEndOffset}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}.bare-path.js`,
  );
  const len = entryEndOffset - entryJsOffset;
  if (!(len > 0)) throw new Error('invalid replay offsets');

  const fd = fs.openSync(sourceBin, 'r');
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, entryJsOffset);
  fs.closeSync(fd);

  fs.writeFileSync(extractedFile, buf.toString('utf8').replace(/[\0\s]+$/g, ''));
  return extractedFile;
}

function isFullWidthCodePoint(codePoint) {
  return Number.isFinite(codePoint) && (
    codePoint >= 0x1100 && (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f6ff) ||
      (codePoint >= 0x1fa70 && codePoint <= 0x1faff) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    )
  );
}

function graphemeWidth(grapheme) {
  let width = 0;
  const symbols = Array.from(String(grapheme ?? ''));
  const codePoints = symbols.map(symbol => symbol.codePointAt(0)).filter(codePoint => Number.isFinite(codePoint));
  if (codePoints.length === 0) return 0;
  if (codePoints.length > 1 && codePoints.every(codePoint => codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff)) {
    return 2;
  }
  if (codePoints.includes(0x20e3) || codePoints.includes(0x200d)) {
    return 2;
  }
  if (codePoints.includes(0xfe0f) || codePoints.some(codePoint => codePoint >= 0x2600 && codePoint <= 0x27bf)) {
    return 2;
  }
  for (const symbol of symbols) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined || codePoint === 0) continue;
    if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) continue;
    if (codePoint === 0x200d || codePoint === 0xfe0f) continue;
    if (/\p{M}/u.test(symbol)) continue;
    if (isFullWidthCodePoint(codePoint)) return 2;
    width = 1;
  }
  return width;
}

function stringWidth(value) {
  const text = stripANSI(value);
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    let width = 0;
    for (const segment of segmenter.segment(text)) width += graphemeWidth(segment.segment);
    return width;
  }
  return Array.from(text).reduce((width, symbol) => width + graphemeWidth(symbol), 0);
}

function stripANSI(value) {
  return String(value ?? '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '');
}

function wrapAnsi(value, columns, options = {}) {
  const text = String(value ?? '');
  const width = Number(columns);
  const hard = options.hard !== false;
  const trim = options.trim === true;
  const wordWrap = options.wordWrap !== false;
  if (!Number.isFinite(width) || width <= 0) return trim ? text.trimEnd() : text;

  const ansiPattern = /\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)/g;
  const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('en', { granularity: 'grapheme' })
    : null;
  const splitVisible = (chunk) => {
    if (chunk === '') return [];
    if (!segmenter) return Array.from(chunk);
    return Array.from(segmenter.segment(chunk), part => part.segment);
  };
  const splitByGrapheme = hard || !wordWrap;
  let result = '';
  let currentWidth = 0;
  let lastIndex = 0;
  const appendVisible = (chunk) => {
    const tokens = splitByGrapheme ? splitVisible(chunk) : (chunk.match(/\s+|[^\s]+/gu) || []);
    for (const token of tokens) {
      if (token === '\n') {
        if (trim) result = result.replace(/[ \t]+$/g, '');
        result += token;
        currentWidth = 0;
        continue;
      }
      const tokenWidth = stringWidth(token);
      const isWhitespace = /^\s+$/u.test(token);
      if (trim && isWhitespace && currentWidth === 0) continue;
      if (currentWidth > 0 && currentWidth + tokenWidth > width) {
        if (!splitByGrapheme && !isWhitespace) {
          result = result.replace(/[ \t]+$/g, '');
          result += '\n';
          currentWidth = 0;
        } else {
          for (const piece of splitVisible(token)) {
            const pieceWidth = stringWidth(piece);
            if (currentWidth > 0 && currentWidth + pieceWidth > width) {
              if (trim) result = result.replace(/[ \t]+$/g, '');
              result += '\n';
              currentWidth = 0;
            }
            if (trim && /^\s+$/u.test(piece) && currentWidth === 0) continue;
            result += piece;
            currentWidth += pieceWidth;
          }
          continue;
        }
      }
      result += token;
      currentWidth += tokenWidth;
    }
  };
  for (const match of text.matchAll(ansiPattern)) {
    appendVisible(text.slice(lastIndex, match.index ?? 0));
    result += match[0];
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  appendVisible(text.slice(lastIndex));
  return trim ? result.replace(/[ \t]+$/gm, '') : result;
}

function stableHash(value, seed) {
  const text = String(value ?? '');
  let hash = 2166136261;
  if (seed !== undefined) {
    const seedText = String(seed ?? '');
    for (let i = 0; i < seedText.length; i += 1) {
      hash ^= seedText.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 0x9e3779b9;
    hash = Math.imul(hash, 16777619);
  }
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function replaceRequired(source, pattern, replacement, label, expectedCount) {
  const text = String(source);
  const matches = text.match(pattern);
  if (!matches || matches.length === 0) {
    throw new Error(`rewriteNativeChunkSource: missing ${label}`);
  }
  if (expectedCount !== undefined && matches.length !== expectedCount) {
    throw new Error(`rewriteNativeChunkSource: unexpected ${label} count ${matches.length}`);
  }
  return text.replace(pattern, replacement);
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

function rewriteNativeChunkSource(source) {
  const rawPrefix = 'function(exports, require, module, __filename, __dirname) {';
  const injectedPrefix = rawPrefix + 'var __claudeBun = globalThis.__claudeBunShim;';
  let patched = String(source);
  patched = replaceRequired(
    patched,
    /^function\(exports, require, module, __filename, __dirname\) \{(?:var __claudeBun = globalThis\.__claudeBunShim;)?/,
    injectedPrefix,
    'module wrapper prefix',
    1,
  );
  const _typeofBunExpected = (() => {
    const _ver = String(process.env.CURRENT_CLAUDE_VERSION || '');
    const _m = _ver.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 237)) return 8;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 200)) return 7;
    return 6;
  })();
  patched = replaceRequired(
    patched,
    /\btypeof Bun\b/g,
    'typeof __claudeBun',
    'typeof Bun',
    _typeofBunExpected,
  );
  patched = replaceRequired(
    patched,
    /\btypeof globalThis\.Bun\b/g,
    'typeof globalThis.__claudeBun',
    'typeof globalThis.Bun',
    1,
  );
  patched = replaceRequired(
    patched,
    /\bglobalThis\.Bun\b/g,
    'globalThis.__claudeBun',
    'globalThis.Bun',
    1,
  );
  const _bunPropertyAccessExpected = (() => {
    const _ver = String(process.env.CURRENT_CLAUDE_VERSION || '');
    const _m = _ver.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 232)) return 45;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 224)) return 44;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 223)) return 43;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 219)) return 42;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 216)) return 40;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 214)) return 39;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 205)) return 38;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 202)) return 41;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 200)) return 40;
    return 37;
  })();
  patched = replaceRequired(
    patched,
    /\bBun\./g,
    '__claudeBun.',
    'Bun property access',
    _bunPropertyAccessExpected,
  );
  const _npmInstallDeprecatedExpected = (() => {
    const _ver = String(process.env.CURRENT_CLAUDE_VERSION || '');
    const _m = _ver.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 227)) return 0;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 203)) return 2;
    return 1;
  })();
  if (_npmInstallDeprecatedExpected > 0) {
    patched = replaceRequired(
      patched,
      /\bnpmInstallDeprecated:!0\b/g,
      'npmInstallDeprecated:!1',
      'npmInstallDeprecated flag',
      _npmInstallDeprecatedExpected,
    );
  }
  patched = replaceRequired(
    patched,
    /function ([A-Za-z_$][\w$]*)\(\)\{(return\([A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*\)=>\{let\{cmd:([A-Za-z_$][\w$]*),prefixArgs:([A-Za-z_$][\w$]*)\}=[A-Za-z_$][\w$]*\(\{pinToCurrentBinary:!0\}\),[A-Za-z_$][\w$]*=\[\3,\.\.\.\4,"--bg-pty-host")/g,
    'function $1(){return undefined;$2',
    'bg-pty-host factory disable',
    1,
  );
  const _agentViewDisabled = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.CLAUDE_CODE_DISABLE_AGENT_VIEW ?? '').toLowerCase().trim(),
  );
  if (_agentViewDisabled) {
    patched = replaceRequired(
      patched,
      /(\{type:"local-jsx",name:"background",aliases:\["bg"\][^}]*?isEnabled:\(\)=>)!0(\})/g,
      '$1!1$2',
      '/background command isEnabled disable',
      1,
    );
  }
  return patched;
}

async function esmChunkedMain() {
  const { prepareProcessOwnedDir } = require(path.join(process.env.CLAUDE_TERMUX_PACKAGE_DIR, 'lib', 'bunfs-extract.js'));
  const { register } = require('node:module');
  const { pathToFileURL } = require('node:url');

  const { ownedDir, entryRelPath } = prepareProcessOwnedDir(sourceBin, workdir);
  const libDir = path.join(process.env.CLAUDE_TERMUX_PACKAGE_DIR, 'lib');

  globalThis.__claudeYaml = createYamlShim();
  globalThis.Bun = {
    version: '1.1.8',
    stringWidth,
    wrapAnsi,
    stripANSI,
    hash: stableHash,
    which: (cmd) => {
      try {
        return require('child_process').execFileSync('which', [String(cmd)], { encoding: 'utf8' }).trim() || null;
      } catch { return null; }
    },
    gc: () => {},
    YAML: globalThis.__claudeYaml,
  };
  Object.defineProperty(process.versions, 'bun', { value: '1.1.8', configurable: true });
  globalThis.__claudeBunShim = globalThis.Bun;
  globalThis.__claudeBun = globalThis.Bun;

  register(pathToFileURL(path.join(libDir, 'bunfs-esm-loader.mjs')).href, {
    parentURL: pathToFileURL(__filename).href,
    data: {
      processOwnedDir: ownedDir,
      sourceBin,
      childProcessGuardPath: path.join(libDir, 'bunfs-child-process-guard.mjs'),
      vmGuardPath: path.join(libDir, 'bunfs-vm-guard.mjs'),
      wsStubPath: path.join(libDir, 'bunfs-ws-stub.mjs'),
    },
  });

  const entryUrl = pathToFileURL(path.join(ownedDir, entryRelPath)).href;

  // 2.1.245実チャンクのエントリは、内部のmain相当処理をトップレベルでawaitせず
  // fire-and-forgetで起動する(Bunランタイム前提の実装)。そのためawait import()は
  // 内部の非同期処理が完了する前に解決してしまい、legacy-cjs経路のような
  // process.exitパッチ+ここでの強制exit呼び出しを行うと、まだ実行中の内部処理を
  // 強制終了させ出力が失われる(実機で確認済み)。process.exit/killは一切パッチせず、
  // 実際のCLIコードが自ら呼ぶprocess.exit()に任せてNodeの自然なイベントループ終了を
  // 待つ(この関数はawait import()完了後、何もせずreturnするだけでよい)。
  // 同じ理由で、ここでglobalThis.Bun/__claudeYamlを削除するcleanupも行わない
  // (fire-and-forgetの内部処理がimport()解決後も継続してBunを参照するため、
  // 早期に消すと実機で"Bun is not defined"を引き起こす。プロセス終了まで残す)。
  await import(entryUrl);
}

async function legacyCjsMain() {
  let extractedFile;
  extractedFile = ensureEntryFile();
  const code = fs.readFileSync(extractedFile, 'utf8');
  const patchedCode = rewriteNativeChunkSource(code);
  const fn = eval('(' + patchedCode.replace(/\)\s*$/, '') + ')');

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;
  const originalKill = process.kill;
  const originalBun = process.versions.bun;
  const hadGlobalBun = Object.prototype.hasOwnProperty.call(globalThis, 'Bun');
  const originalGlobalBun = globalThis.Bun;
  const asyncErrors = [];
  let streamJsonWatcher = null;

  globalThis.__claudeYaml = createYamlShim();
  if (!globalThis.__claudeBunShim || typeof globalThis.__claudeBunShim !== 'object') {
    globalThis.__claudeBunShim = {};
  }
  const fakeRequire = createFakeRequire(require);
  function onAsyncError(error) {
    asyncErrors.push(error);
  }
  const printWaitMs = Number(process.env.CLAUDE_TERMUX_PRINT_WAIT_MS || 5000);

  function installPlainTextWriteWatcher() {
    const hadOwnWrite = Object.prototype.hasOwnProperty.call(process.stdout, 'write');
    const originalWriteDescriptor = hadOwnWrite ? Object.getOwnPropertyDescriptor(process.stdout, 'write') : undefined;
    const originalWrite = process.stdout.write.bind(process.stdout);
    let foundOutput = false;
    let resultPromiseResolve = null;
    let restored = false;

    process.stdout.write = function wrappedWrite(chunk, encoding, callback) {
      let cb = callback;
      let enc = encoding;
      if (typeof encoding === 'function') {
        cb = encoding;
        enc = undefined;
      }
      const combinedCallback = (err) => {
        if (!err && !foundOutput) {
          const len = typeof chunk === 'string'
            ? Buffer.byteLength(chunk, typeof enc === 'string' ? enc : 'utf8')
            : (Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk ?? ''), 'utf8'));
          if (len > 0) {
            foundOutput = true;
            if (typeof resultPromiseResolve === 'function') resultPromiseResolve();
          }
        }
        if (typeof cb === 'function') cb(err);
      };
      return originalWrite(chunk, enc, combinedCallback);
    };

    return {
      waitForResult() {
        if (foundOutput) return Promise.resolve();
        return new Promise((resolve) => {
          resultPromiseResolve = resolve;
        });
      },
      hasOutput() {
        return foundOutput;
      },
      restore() {
        if (restored) return;
        restored = true;
        if (hadOwnWrite) {
          Object.defineProperty(process.stdout, 'write', originalWriteDescriptor);
        } else {
          delete process.stdout.write;
        }
      },
    };
  }

  function installStreamJsonTerminalWatcher() {
    const hadOwnWrite = Object.prototype.hasOwnProperty.call(process.stdout, 'write');
    const originalWriteDescriptor = hadOwnWrite ? Object.getOwnPropertyDescriptor(process.stdout, 'write') : undefined;
    const originalWrite = process.stdout.write.bind(process.stdout);
    const { StringDecoder } = require('string_decoder');
    const decoder = new StringDecoder('utf8');
    let lineBuffer = '';
    let resultPromiseResolve = null;
    let foundResult = false;
    let restored = false;

    process.stdout.write = function wrappedWrite(chunk, encoding, callback) {
      let cb = callback;
      let enc = encoding;
      if (typeof encoding === 'function') {
        cb = encoding;
        enc = undefined;
      }
      const combinedCallback = (err) => {
        if (!err && !foundResult) {
          const chunkStr = typeof chunk === 'string'
            ? decoder.write(Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8'))
            : decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          lineBuffer += chunkStr;
          const lines = lineBuffer.split('\n');
          lineBuffer = lines[lines.length - 1];
          for (let i = 0; i < lines.length - 1; i++) {
            try {
              const parsed = JSON.parse(lines[i]);
              if (parsed && parsed.type === 'result') {
                foundResult = true;
                if (typeof resultPromiseResolve === 'function') resultPromiseResolve();
              }
            } catch {}
          }
        }
        if (typeof cb === 'function') cb(err);
      };
      return originalWrite(chunk, enc, combinedCallback);
    };

    return {
      waitForResult() {
        if (foundResult) return Promise.resolve();
        return new Promise((resolve, reject) => {
          resultPromiseResolve = resolve;
        });
      },
      restore() {
        if (restored) return;
        restored = true;
        if (hadOwnWrite) {
          Object.defineProperty(process.stdout, 'write', originalWriteDescriptor);
        } else {
          delete process.stdout.write;
        }
      },
    };
  }

  function forceTimeoutExit(exitCode) {
    try { if (streamJsonWatcher) streamJsonWatcher.restore(); } catch {}
    if (extractedFile) {
      try { fs.rmSync(extractedFile, { force: true }); } catch {}
    }
    originalExit(exitCode);
  }

  async function waitForPrintFlush() {
    if (isStreamJsonPrintMode(argv) && streamJsonWatcher) {
      let timedOut = false;
      const rawResultTimeoutMs = Number(process.env.CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS);
      const resultTimeoutMs = (Number.isFinite(rawResultTimeoutMs) && rawResultTimeoutMs > 0) ? rawResultTimeoutMs : 300000;
      let timeoutHandle;
      const timeoutPromise = new Promise(resolve => {
        timeoutHandle = setTimeout(() => { timedOut = true; resolve(); }, resultTimeoutMs);
      });
      try {
        await Promise.race([streamJsonWatcher.waitForResult(), timeoutPromise]);
      } finally {
        clearTimeout(timeoutHandle);
      }
      if (timedOut) {
        forceTimeoutExit(1);
        return;
      }
      return;
    }
    if (streamJsonWatcher && typeof streamJsonWatcher.hasOutput === 'function') {
      if (streamJsonWatcher.hasOutput()) {
        return;
      }
      const gatingExitCode = process.exitCode;
      const rawResultTimeoutMs = Number(process.env.CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS);
      const extendedTimeoutMs = (Number.isFinite(rawResultTimeoutMs) && rawResultTimeoutMs > 0) ? rawResultTimeoutMs : 300000;
      const noOutputTimeoutMs = (gatingExitCode !== undefined && gatingExitCode !== 0) ? printWaitMs : extendedTimeoutMs;
      let timeoutHandle;
      const timeoutPromise = new Promise(resolve => {
        timeoutHandle = setTimeout(resolve, noOutputTimeoutMs);
      });
      try {
        await Promise.race([streamJsonWatcher.waitForResult(), timeoutPromise]);
      } finally {
        clearTimeout(timeoutHandle);
      }
      return;
    }
    if (Number.isFinite(printWaitMs) && printWaitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, printWaitMs));
    }
  }

  try {
    process.once('uncaughtException', onAsyncError);
    process.once('unhandledRejection', onAsyncError);
    Object.defineProperty(process.versions, 'bun', { value: '1.1.8', configurable: true });
    const _realChild = require('child_process');
    globalThis.Bun = {
      version: '1.1.8',
      stringWidth,
      wrapAnsi,
      stripANSI,
      hash: stableHash,
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
        spawn: (cmd, options) => {
          const opts = options || {};
          const stdioArrayRaw = opts.stdio;
          const cmdArray = Array.isArray(cmd) ? cmd : [cmd];
          const normalizeStdio = (v) => {
            if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
            return (v === 'ignore' || v === 'pipe' || v === 'inherit') ? v : 'pipe';
          };
          const stdioMapped = Array.isArray(stdioArrayRaw)
            ? stdioArrayRaw.map(normalizeStdio)
            : [normalizeStdio(opts.stdin), normalizeStdio(opts.stdout), normalizeStdio(opts.stderr)];
          const child = _realChild.spawn(cmdArray[0], cmdArray.slice(1), {
            stdio: stdioMapped,
            cwd: opts.cwd,
            env: opts.env,
            detached: !!opts.detached,
            argv0: opts.argv0,
          });
          const stdoutChunks = [];
          if (child.stdout) child.stdout.on('data', d => stdoutChunks.push(d));
          let resolveExited;
          const exited = new Promise(resolve => { resolveExited = resolve; });
          child.on('exit', (code, signal) => resolveExited(code !== null ? code : (signal ? 128 : 0)));
          child.on('error', () => resolveExited(1));
          return {
            pid: child.pid,
            exited,
            stdout: { text: async () => { await exited; return Buffer.concat(stdoutChunks).toString('utf8'); } },
            unref: () => { try { child.unref(); } catch {} },
            kill: (signal) => { try { child.kill(signal); } catch {} },
          };
        },
        file: (path) => {
          const err = new Error(`ENOENT: Bun.file(${String(path)}) is not supported by the Termux compatibility shim`);
          err.code = 'ENOENT';
          err.errno = -2;
          throw err;
        },
    };
    Object.assign(globalThis.__claudeBunShim, globalThis.Bun);
    if (typeof globalThis.__claudeBunShim.gc !== 'function') {
      globalThis.__claudeBunShim.gc = () => {};
    }
    globalThis.__claudeBun = globalThis.__claudeBunShim;
    globalThis.Bun = globalThis.__claudeBunShim;
    process.argv = ['node', extractedFile, ...argv];
    let lastExitAttemptCode = 0;
    process.exit = code => {
      lastExitAttemptCode = code ?? 0;
      throw new RequestedExit(lastExitAttemptCode);
    };
    process.kill = (pid, signal) => {
      if (pid === process.pid && (signal === 'SIGKILL' || signal === 9)) {
        throw new RequestedExit(lastExitAttemptCode);
      }
      return originalKill.call(process, pid, signal);
    };

    if (isStreamJsonPrintMode(argv)) {
      streamJsonWatcher = installStreamJsonTerminalWatcher();
    } else {
      streamJsonWatcher = installPlainTextWriteWatcher();
    }

    const moduleLike = { exports: {} };
    const maybePromise = fn(moduleLike.exports, fakeRequire, moduleLike, extractedFile, workdir);
    if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
    await waitForPrintFlush();
    if (asyncErrors.length > 0) throw asyncErrors[0];
  } catch (error) {
    if (error instanceof RequestedExit) {
      process.exitCode = error.code;
      await waitForPrintFlush();
      return;
    }
    throw error;
  } finally {
    process.removeListener('uncaughtException', onAsyncError);
    process.removeListener('unhandledRejection', onAsyncError);
    if (extractedFile) {
      try {
        fs.rmSync(extractedFile, { force: true });
      } catch {}
    }
    process.argv = originalArgv;
    process.exit = originalExit;
    process.kill = originalKill;
    if (streamJsonWatcher) {
      try { streamJsonWatcher.restore(); } catch {}
    }
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

function main() {
  return process.env.ENTRY_FORMAT === 'esm-chunked' ? esmChunkedMain() : legacyCjsMain();
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
  export ENABLE_CLAUDEAI_MCP_SERVERS="${ENABLE_CLAUDEAI_MCP_SERVERS:-0}"
  export CLAUDE_CODE_SIMPLE="${CLAUDE_CODE_SIMPLE:-0}"
  export DISABLE_INSTALLATION_CHECKS="${DISABLE_INSTALLATION_CHECKS:-true}"
  "$NODE" "$_helper" "$@" </dev/null
  _status=$?
  rm -f "$_helper"
  trap - EXIT HUP INT TERM
  exit "$_status"
else
  _bootstrap=$(mktemp "${TERMUX_TMPDIR}/claude-bootstrap.XXXXXX.js")
  trap 'rm -f "$_bootstrap"' EXIT HUP INT TERM
  export CLAUDE_TERMUX_TUI="${_tui}"
  export CLAUDE_TERMUX_PRINT_MODE="${_pf}"
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

function isStreamJsonPrintMode(argv) {
  const dashDashIndex = argv.indexOf('--');
  const ownArgs = dashDashIndex === -1 ? argv : argv.slice(0, dashDashIndex);
  const hasPrintFlag = ownArgs.includes('-p') || ownArgs.includes('--print');
  let hasStreamJsonFormat = false;
  for (let i = 0; i < ownArgs.length; i++) {
    const tok = ownArgs[i];
    if (tok === '--output-format=stream-json') { hasStreamJsonFormat = true; break; }
    if (tok === '--output-format' && ownArgs[i + 1] === 'stream-json') {
      hasStreamJsonFormat = true;
      break;
    }
  }
  return hasPrintFlag && hasStreamJsonFormat;
}

class RequestedExit extends Error {
  constructor(code) {
    super(`process.exit ${code}`);
    this.name = 'RequestedExit';
    this.code = code;
  }
}

function cleanupStaleEntryFiles(currentWorkdir = workdir, currentEntryJsOffset = entryJsOffset, currentEntryEndOffset = entryEndOffset, now = Date.now()) {
  const prefix = `cli.${currentEntryJsOffset}.${currentEntryEndOffset}.`;
  const suffix = '.bare-path.js';
  const maxAgeMs = 24 * 60 * 60 * 1000;
  let entries;
  try {
    entries = fs.readdirSync(currentWorkdir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    if (!entry.name.startsWith(prefix) || !entry.name.endsWith(suffix)) continue;
    const filePath = path.join(currentWorkdir, entry.name);
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (Number.isFinite(stats.mtimeMs) && now - stats.mtimeMs < maxAgeMs) continue;
    try {
      fs.rmSync(filePath, { force: true });
    } catch {}
  }
}

function ensureEntryFile() {
  cleanupStaleEntryFiles();
  const extractedFile = path.join(
    workdir,
    `cli.${entryJsOffset}.${entryEndOffset}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}.bare-path.js`,
  );
  const len = entryEndOffset - entryJsOffset;
  if (!(len > 0)) throw new Error('invalid replay offsets');

  const fd = fs.openSync(sourceBin, 'r');
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, entryJsOffset);
  fs.closeSync(fd);

  fs.writeFileSync(extractedFile, buf.toString('utf8').replace(/[\0\s]+$/g, ''));
  return extractedFile;
}

function isFullWidthCodePoint(codePoint) {
  return Number.isFinite(codePoint) && (
    codePoint >= 0x1100 && (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f6ff) ||
      (codePoint >= 0x1fa70 && codePoint <= 0x1faff) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    )
  );
}

function graphemeWidth(grapheme) {
  let width = 0;
  const symbols = Array.from(String(grapheme ?? ''));
  const codePoints = symbols.map(symbol => symbol.codePointAt(0)).filter(codePoint => Number.isFinite(codePoint));
  if (codePoints.length === 0) return 0;
  if (codePoints.length > 1 && codePoints.every(codePoint => codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff)) {
    return 2;
  }
  if (codePoints.includes(0x20e3) || codePoints.includes(0x200d)) {
    return 2;
  }
  if (codePoints.includes(0xfe0f) || codePoints.some(codePoint => codePoint >= 0x2600 && codePoint <= 0x27bf)) {
    return 2;
  }
  for (const symbol of symbols) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined || codePoint === 0) continue;
    if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) continue;
    if (codePoint === 0x200d || codePoint === 0xfe0f) continue;
    if (/\p{M}/u.test(symbol)) continue;
    if (isFullWidthCodePoint(codePoint)) return 2;
    width = 1;
  }
  return width;
}

function stringWidth(value) {
  const text = stripANSI(value);
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    let width = 0;
    for (const segment of segmenter.segment(text)) width += graphemeWidth(segment.segment);
    return width;
  }
  return Array.from(text).reduce((width, symbol) => width + graphemeWidth(symbol), 0);
}

function stripANSI(value) {
  return String(value ?? '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '');
}

function wrapAnsi(value, columns, options = {}) {
  const text = String(value ?? '');
  const width = Number(columns);
  const hard = options.hard !== false;
  const trim = options.trim === true;
  const wordWrap = options.wordWrap !== false;
  if (!Number.isFinite(width) || width <= 0) return trim ? text.trimEnd() : text;

  const ansiPattern = /\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)/g;
  const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('en', { granularity: 'grapheme' })
    : null;
  const splitVisible = (chunk) => {
    if (chunk === '') return [];
    if (!segmenter) return Array.from(chunk);
    return Array.from(segmenter.segment(chunk), part => part.segment);
  };
  const splitByGrapheme = hard || !wordWrap;
  let result = '';
  let currentWidth = 0;
  let lastIndex = 0;
  const appendVisible = (chunk) => {
    const tokens = splitByGrapheme ? splitVisible(chunk) : (chunk.match(/\s+|[^\s]+/gu) || []);
    for (const token of tokens) {
      if (token === '\n') {
        if (trim) result = result.replace(/[ \t]+$/g, '');
        result += token;
        currentWidth = 0;
        continue;
      }
      const tokenWidth = stringWidth(token);
      const isWhitespace = /^\s+$/u.test(token);
      if (trim && isWhitespace && currentWidth === 0) continue;
      if (currentWidth > 0 && currentWidth + tokenWidth > width) {
        if (!splitByGrapheme && !isWhitespace) {
          result = result.replace(/[ \t]+$/g, '');
          result += '\n';
          currentWidth = 0;
        } else {
          for (const piece of splitVisible(token)) {
            const pieceWidth = stringWidth(piece);
            if (currentWidth > 0 && currentWidth + pieceWidth > width) {
              if (trim) result = result.replace(/[ \t]+$/g, '');
              result += '\n';
              currentWidth = 0;
            }
            if (trim && /^\s+$/u.test(piece) && currentWidth === 0) continue;
            result += piece;
            currentWidth += pieceWidth;
          }
          continue;
        }
      }
      result += token;
      currentWidth += tokenWidth;
    }
  };
  for (const match of text.matchAll(ansiPattern)) {
    appendVisible(text.slice(lastIndex, match.index ?? 0));
    result += match[0];
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  appendVisible(text.slice(lastIndex));
  return trim ? result.replace(/[ \t]+$/gm, '') : result;
}

function stableHash(value, seed) {
  const text = String(value ?? '');
  let hash = 2166136261;
  if (seed !== undefined) {
    const seedText = String(seed ?? '');
    for (let i = 0; i < seedText.length; i += 1) {
      hash ^= seedText.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 0x9e3779b9;
    hash = Math.imul(hash, 16777619);
  }
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function replaceRequired(source, pattern, replacement, label, expectedCount) {
  const text = String(source);
  const matches = text.match(pattern);
  if (!matches || matches.length === 0) {
    throw new Error(`rewriteNativeChunkSource: missing ${label}`);
  }
  if (expectedCount !== undefined && matches.length !== expectedCount) {
    throw new Error(`rewriteNativeChunkSource: unexpected ${label} count ${matches.length}`);
  }
  return text.replace(pattern, replacement);
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

function rewriteNativeChunkSource(source) {
  const rawPrefix = 'function(exports, require, module, __filename, __dirname) {';
  const injectedPrefix = rawPrefix + 'var __claudeBun = globalThis.__claudeBunShim;';
  let patched = String(source);
  patched = replaceRequired(
    patched,
    /^function\(exports, require, module, __filename, __dirname\) \{(?:var __claudeBun = globalThis\.__claudeBunShim;)?/,
    injectedPrefix,
    'module wrapper prefix',
    1,
  );
  const _typeofBunExpected = (() => {
    const _ver = String(process.env.CURRENT_CLAUDE_VERSION || '');
    const _m = _ver.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 237)) return 8;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 200)) return 7;
    return 6;
  })();
  patched = replaceRequired(
    patched,
    /\btypeof Bun\b/g,
    'typeof __claudeBun',
    'typeof Bun',
    _typeofBunExpected,
  );
  patched = replaceRequired(
    patched,
    /\btypeof globalThis\.Bun\b/g,
    'typeof globalThis.__claudeBun',
    'typeof globalThis.Bun',
    1,
  );
  patched = replaceRequired(
    patched,
    /\bglobalThis\.Bun\b/g,
    'globalThis.__claudeBun',
    'globalThis.Bun',
    1,
  );
  const _bunPropertyAccessExpected = (() => {
    const _ver = String(process.env.CURRENT_CLAUDE_VERSION || '');
    const _m = _ver.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 232)) return 45;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 224)) return 44;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 223)) return 43;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 219)) return 42;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 216)) return 40;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 214)) return 39;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 205)) return 38;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 202)) return 41;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 200)) return 40;
    return 37;
  })();
  patched = replaceRequired(
    patched,
    /\bBun\./g,
    '__claudeBun.',
    'Bun property access',
    _bunPropertyAccessExpected,
  );
  const _npmInstallDeprecatedExpected = (() => {
    const _ver = String(process.env.CURRENT_CLAUDE_VERSION || '');
    const _m = _ver.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 227)) return 0;
    if (_m && (Number(_m[1]) > 2 || Number(_m[2]) > 1 || Number(_m[3]) >= 203)) return 2;
    return 1;
  })();
  if (_npmInstallDeprecatedExpected > 0) {
    patched = replaceRequired(
      patched,
      /\bnpmInstallDeprecated:!0\b/g,
      'npmInstallDeprecated:!1',
      'npmInstallDeprecated flag',
      _npmInstallDeprecatedExpected,
    );
  }
  patched = replaceRequired(
    patched,
    /function ([A-Za-z_$][\w$]*)\(\)\{(return\([A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*\)=>\{let\{cmd:([A-Za-z_$][\w$]*),prefixArgs:([A-Za-z_$][\w$]*)\}=[A-Za-z_$][\w$]*\(\{pinToCurrentBinary:!0\}\),[A-Za-z_$][\w$]*=\[\3,\.\.\.\4,"--bg-pty-host")/g,
    'function $1(){return undefined;$2',
    'bg-pty-host factory disable',
    1,
  );
  const _agentViewDisabled = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.CLAUDE_CODE_DISABLE_AGENT_VIEW ?? '').toLowerCase().trim(),
  );
  if (_agentViewDisabled) {
    patched = replaceRequired(
      patched,
      /(\{type:"local-jsx",name:"background",aliases:\["bg"\][^}]*?isEnabled:\(\)=>)!0(\})/g,
      '$1!1$2',
      '/background command isEnabled disable',
      1,
    );
  }
  return patched;
}

async function esmChunkedMain() {
  const { prepareProcessOwnedDir } = require(path.join(process.env.CLAUDE_TERMUX_PACKAGE_DIR, 'lib', 'bunfs-extract.js'));
  const { register } = require('node:module');
  const { pathToFileURL } = require('node:url');

  const { ownedDir, entryRelPath } = prepareProcessOwnedDir(sourceBin, workdir);
  const libDir = path.join(process.env.CLAUDE_TERMUX_PACKAGE_DIR, 'lib');

  globalThis.__claudeYaml = createYamlShim();
  globalThis.Bun = {
    version: '1.1.8',
    stringWidth,
    wrapAnsi,
    stripANSI,
    hash: stableHash,
    which: (cmd) => {
      try {
        return require('child_process').execFileSync('which', [String(cmd)], { encoding: 'utf8' }).trim() || null;
      } catch { return null; }
    },
    gc: () => {},
    YAML: globalThis.__claudeYaml,
  };
  Object.defineProperty(process.versions, 'bun', { value: '1.1.8', configurable: true });
  globalThis.__claudeBunShim = globalThis.Bun;
  globalThis.__claudeBun = globalThis.Bun;

  register(pathToFileURL(path.join(libDir, 'bunfs-esm-loader.mjs')).href, {
    parentURL: pathToFileURL(__filename).href,
    data: {
      processOwnedDir: ownedDir,
      sourceBin,
      childProcessGuardPath: path.join(libDir, 'bunfs-child-process-guard.mjs'),
      vmGuardPath: path.join(libDir, 'bunfs-vm-guard.mjs'),
      wsStubPath: path.join(libDir, 'bunfs-ws-stub.mjs'),
    },
  });

  const entryUrl = pathToFileURL(path.join(ownedDir, entryRelPath)).href;

  // 2.1.245実チャンクのエントリは、内部のmain相当処理をトップレベルでawaitせず
  // fire-and-forgetで起動する(Bunランタイム前提の実装)。そのためawait import()は
  // 内部の非同期処理が完了する前に解決してしまい、legacy-cjs経路のような
  // process.exitパッチ+ここでの強制exit呼び出しを行うと、まだ実行中の内部処理を
  // 強制終了させ出力が失われる(実機で確認済み)。process.exit/killは一切パッチせず、
  // 実際のCLIコードが自ら呼ぶprocess.exit()に任せてNodeの自然なイベントループ終了を
  // 待つ(この関数はawait import()完了後、何もせずreturnするだけでよい)。
  // 同じ理由で、ここでglobalThis.Bun/__claudeYamlを削除するcleanupも行わない
  // (fire-and-forgetの内部処理がimport()解決後も継続してBunを参照するため、
  // 早期に消すと実機で"Bun is not defined"を引き起こす。プロセス終了まで残す)。
  await import(entryUrl);
}

async function legacyCjsMain() {
  let extractedFile;
  extractedFile = ensureEntryFile();
  const code = fs.readFileSync(extractedFile, 'utf8');
  const patchedCode = rewriteNativeChunkSource(code);
  const fn = eval('(' + patchedCode.replace(/\)\s*$/, '') + ')');

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;
  const originalKill = process.kill;
  const originalBun = process.versions.bun;
  const hadGlobalBun = Object.prototype.hasOwnProperty.call(globalThis, 'Bun');
  const originalGlobalBun = globalThis.Bun;
  const asyncErrors = [];
  let streamJsonWatcher = null;

  globalThis.__claudeYaml = createYamlShim();
  if (!globalThis.__claudeBunShim || typeof globalThis.__claudeBunShim !== 'object') {
    globalThis.__claudeBunShim = {};
  }
  const fakeRequire = createFakeRequire(require);
  function onAsyncError(error) {
    asyncErrors.push(error);
  }

  function installPlainTextWriteWatcher() {
    const hadOwnWrite = Object.prototype.hasOwnProperty.call(process.stdout, 'write');
    const originalWriteDescriptor = hadOwnWrite ? Object.getOwnPropertyDescriptor(process.stdout, 'write') : undefined;
    const originalWrite = process.stdout.write.bind(process.stdout);
    let foundOutput = false;
    let resultPromiseResolve = null;
    let restored = false;

    process.stdout.write = function wrappedWrite(chunk, encoding, callback) {
      let cb = callback;
      let enc = encoding;
      if (typeof encoding === 'function') {
        cb = encoding;
        enc = undefined;
      }
      const combinedCallback = (err) => {
        if (!err && !foundOutput) {
          const len = typeof chunk === 'string'
            ? Buffer.byteLength(chunk, typeof enc === 'string' ? enc : 'utf8')
            : (Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk ?? ''), 'utf8'));
          if (len > 0) {
            foundOutput = true;
            if (typeof resultPromiseResolve === 'function') resultPromiseResolve();
          }
        }
        if (typeof cb === 'function') cb(err);
      };
      return originalWrite(chunk, enc, combinedCallback);
    };

    return {
      waitForResult() {
        if (foundOutput) return Promise.resolve();
        return new Promise((resolve) => {
          resultPromiseResolve = resolve;
        });
      },
      hasOutput() {
        return foundOutput;
      },
      restore() {
        if (restored) return;
        restored = true;
        if (hadOwnWrite) {
          Object.defineProperty(process.stdout, 'write', originalWriteDescriptor);
        } else {
          delete process.stdout.write;
        }
      },
    };
  }

  function installStreamJsonTerminalWatcher() {
    const hadOwnWrite = Object.prototype.hasOwnProperty.call(process.stdout, 'write');
    const originalWriteDescriptor = hadOwnWrite ? Object.getOwnPropertyDescriptor(process.stdout, 'write') : undefined;
    const originalWrite = process.stdout.write.bind(process.stdout);
    const { StringDecoder } = require('string_decoder');
    const decoder = new StringDecoder('utf8');
    let lineBuffer = '';
    let resultPromiseResolve = null;
    let foundResult = false;
    let restored = false;

    process.stdout.write = function wrappedWrite(chunk, encoding, callback) {
      let cb = callback;
      let enc = encoding;
      if (typeof encoding === 'function') {
        cb = encoding;
        enc = undefined;
      }
      const combinedCallback = (err) => {
        if (!err && !foundResult) {
          const chunkStr = typeof chunk === 'string'
            ? decoder.write(Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8'))
            : decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          lineBuffer += chunkStr;
          const lines = lineBuffer.split('\n');
          lineBuffer = lines[lines.length - 1];
          for (let i = 0; i < lines.length - 1; i++) {
            try {
              const parsed = JSON.parse(lines[i]);
              if (parsed && parsed.type === 'result') {
                foundResult = true;
                if (typeof resultPromiseResolve === 'function') resultPromiseResolve();
              }
            } catch {}
          }
        }
        if (typeof cb === 'function') cb(err);
      };
      return originalWrite(chunk, enc, combinedCallback);
    };

    return {
      waitForResult() {
        if (foundResult) return Promise.resolve();
        return new Promise((resolve, reject) => {
          resultPromiseResolve = resolve;
        });
      },
      restore() {
        if (restored) return;
        restored = true;
        if (hadOwnWrite) {
          Object.defineProperty(process.stdout, 'write', originalWriteDescriptor);
        } else {
          delete process.stdout.write;
        }
      },
    };
  }

  function forceTimeoutExit(exitCode) {
    try { if (streamJsonWatcher) streamJsonWatcher.restore(); } catch {}
    if (extractedFile) {
      try { fs.rmSync(extractedFile, { force: true }); } catch {}
    }
    originalExit(exitCode);
  }

  async function waitForPrintFlushIfNeeded() {
    if (process.env.CLAUDE_TERMUX_PRINT_MODE !== '1') return;
    if (isStreamJsonPrintMode(argv) && streamJsonWatcher) {
      let timedOut = false;
      const rawResultTimeoutMs = Number(process.env.CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS);
      const resultTimeoutMs = (Number.isFinite(rawResultTimeoutMs) && rawResultTimeoutMs > 0) ? rawResultTimeoutMs : 300000;
      let timeoutHandle;
      const timeoutPromise = new Promise(resolve => {
        timeoutHandle = setTimeout(() => { timedOut = true; resolve(); }, resultTimeoutMs);
      });
      try {
        await Promise.race([streamJsonWatcher.waitForResult(), timeoutPromise]);
      } finally {
        clearTimeout(timeoutHandle);
      }
      if (timedOut) {
        forceTimeoutExit(1);
        return;
      }
      return;
    }
    if (streamJsonWatcher && typeof streamJsonWatcher.hasOutput === 'function') {
      if (streamJsonWatcher.hasOutput()) {
        return;
      }
      const printWaitMs = Number(process.env.CLAUDE_TERMUX_PRINT_WAIT_MS || 5000);
      const gatingExitCode = process.exitCode;
      const rawResultTimeoutMs = Number(process.env.CLAUDE_TERMUX_PRINT_RESULT_TIMEOUT_MS);
      const extendedTimeoutMs = (Number.isFinite(rawResultTimeoutMs) && rawResultTimeoutMs > 0) ? rawResultTimeoutMs : 300000;
      const noOutputTimeoutMs = (gatingExitCode !== undefined && gatingExitCode !== 0) ? printWaitMs : extendedTimeoutMs;
      let timeoutHandle;
      const timeoutPromise = new Promise(resolve => {
        timeoutHandle = setTimeout(resolve, noOutputTimeoutMs);
      });
      try {
        await Promise.race([streamJsonWatcher.waitForResult(), timeoutPromise]);
      } finally {
        clearTimeout(timeoutHandle);
      }
      return;
    }
    const printWaitMs = Number(process.env.CLAUDE_TERMUX_PRINT_WAIT_MS || 5000);
    if (Number.isFinite(printWaitMs) && printWaitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, printWaitMs));
    }
  }

  try {
    process.once('uncaughtException', onAsyncError);
    process.once('unhandledRejection', onAsyncError);
    Object.defineProperty(process.versions, 'bun', { value: '1.1.8', configurable: true });
    const _realChild = require('child_process');
    globalThis.Bun = {
      version: '1.1.8',
      stringWidth,
      wrapAnsi,
      stripANSI,
      hash: stableHash,
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
        spawn: (cmd, options) => {
          const opts = options || {};
          const stdioArrayRaw = opts.stdio;
          const cmdArray = Array.isArray(cmd) ? cmd : [cmd];
          const normalizeStdio = (v) => {
            if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
            return (v === 'ignore' || v === 'pipe' || v === 'inherit') ? v : 'pipe';
          };
          const stdioMapped = Array.isArray(stdioArrayRaw)
            ? stdioArrayRaw.map(normalizeStdio)
            : [normalizeStdio(opts.stdin), normalizeStdio(opts.stdout), normalizeStdio(opts.stderr)];
          const child = _realChild.spawn(cmdArray[0], cmdArray.slice(1), {
            stdio: stdioMapped,
            cwd: opts.cwd,
            env: opts.env,
            detached: !!opts.detached,
            argv0: opts.argv0,
          });
          const stdoutChunks = [];
          if (child.stdout) child.stdout.on('data', d => stdoutChunks.push(d));
          let resolveExited;
          const exited = new Promise(resolve => { resolveExited = resolve; });
          child.on('exit', (code, signal) => resolveExited(code !== null ? code : (signal ? 128 : 0)));
          child.on('error', () => resolveExited(1));
          return {
            pid: child.pid,
            exited,
            stdout: { text: async () => { await exited; return Buffer.concat(stdoutChunks).toString('utf8'); } },
            unref: () => { try { child.unref(); } catch {} },
            kill: (signal) => { try { child.kill(signal); } catch {} },
          };
        },
        file: (path) => {
          const err = new Error(`ENOENT: Bun.file(${String(path)}) is not supported by the Termux compatibility shim`);
          err.code = 'ENOENT';
          err.errno = -2;
          throw err;
        },
    };
    Object.assign(globalThis.__claudeBunShim, globalThis.Bun);
    if (typeof globalThis.__claudeBunShim.gc !== 'function') {
      globalThis.__claudeBunShim.gc = () => {};
    }
    globalThis.__claudeBun = globalThis.__claudeBunShim;
    globalThis.Bun = globalThis.__claudeBunShim;
    process.argv = ['node', extractedFile, ...argv];
    let lastExitAttemptCode = 0;
    process.exit = code => {
      lastExitAttemptCode = code ?? 0;
      throw new RequestedExit(lastExitAttemptCode);
    };
    process.kill = (pid, signal) => {
      if (pid === process.pid && (signal === 'SIGKILL' || signal === 9)) {
        throw new RequestedExit(lastExitAttemptCode);
      }
      return originalKill.call(process, pid, signal);
    };

    if (isStreamJsonPrintMode(argv)) {
      streamJsonWatcher = installStreamJsonTerminalWatcher();
    } else if (process.env.CLAUDE_TERMUX_PRINT_MODE === '1') {
      streamJsonWatcher = installPlainTextWriteWatcher();
    }

    const moduleLike = { exports: {} };
    const maybePromise = fn(moduleLike.exports, fakeRequire, moduleLike, extractedFile, workdir);
    if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
    await waitForPrintFlushIfNeeded();
    if (asyncErrors.length > 0) throw asyncErrors[0];
  } catch (error) {
    if (error instanceof RequestedExit) {
      process.exitCode = error.code;
      await waitForPrintFlushIfNeeded();
      return;
    }
    throw error;
  } finally {
    process.removeListener('uncaughtException', onAsyncError);
    process.removeListener('unhandledRejection', onAsyncError);
    process.argv = originalArgv;
    process.exit = originalExit;
    process.kill = originalKill;
    if (streamJsonWatcher) {
      try { streamJsonWatcher.restore(); } catch {}
    }
    process.once('exit', () => {
      if (extractedFile) {
        try {
          fs.rmSync(extractedFile, { force: true });
        } catch {}
      }
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
    });
  }
}

function main() {
  return process.env.ENTRY_FORMAT === 'esm-chunked' ? esmChunkedMain() : legacyCjsMain();
}

main()
  .then(() => {
    // esm-chunked経路は内部のfire-and-forget非同期処理が実際のprocess.exit()を
    // 自ら呼ぶまでNodeのイベントループを生かしておく必要があるため、TUIモードと
    // 同様にここでは強制exitしない(実機で確認済み: 強制exitすると--helpの出力等が
    // 完了前に打ち切られる)。
    if (process.env.ENTRY_FORMAT === 'esm-chunked') {
      return;
    }
    if (process.env.CLAUDE_TERMUX_TUI === '1' && process.exitCode === undefined) {
      return;
    }
    process.exit(process.exitCode ?? 0);
  })
  .catch(error => {
    if (error && error.code === 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED') {
      console.error(BLOCK_MESSAGE);
      process.exit(error.status || 1);
      return;
    }
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
NODE
  export ENABLE_CLAUDEAI_MCP_SERVERS="${ENABLE_CLAUDEAI_MCP_SERVERS:-0}"
  export DISABLE_INSTALLATION_CHECKS="${DISABLE_INSTALLATION_CHECKS:-true}"
  "$NODE" "$_bootstrap" "$@"
  _status=$?
  rm -f "$_bootstrap"
  trap - EXIT HUP INT TERM
  exit "$_status"
fi
