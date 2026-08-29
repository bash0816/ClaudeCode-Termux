import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

let PROCESS_OWNED_DIR = null;
let SOURCE_BIN = null;
let CHILD_PROCESS_GUARD_PATH = null;
let VM_GUARD_PATH = null;
let WS_STUB_PATH = null;

export function initialize(data) {
  PROCESS_OWNED_DIR = data.processOwnedDir;
  SOURCE_BIN = data.sourceBin;
  CHILD_PROCESS_GUARD_PATH = data.childProcessGuardPath;
  VM_GUARD_PATH = data.vmGuardPath;
  WS_STUB_PATH = data.wsStubPath;
}

const CYCLE_HOIST_TARGET_FILE = 'chunk-vmw9kxhv.js';
const CYCLE_HOIST_TARGET_DECL = 'var O9=import.meta.require("/$bunfs/root/chunk-y0jj307t.js")';
const CYCLE_HOIST_TARGET_MODULE = 'chunk-y0jj307t.js';
const CYCLE_HOIST_REPLACEMENT = 'var O9=__bunfsHoisted_0';

function tryHoistCycleBreakingImport(filePath, source) {
  const rel = path.relative(PROCESS_OWNED_DIR, filePath);
  if (rel !== CYCLE_HOIST_TARGET_FILE) return null;

  // 出現数が厳密に1件でなければ変換しない(fail-closed)
  const occurrences = source.split(CYCLE_HOIST_TARGET_DECL).length - 1;
  if (occurrences !== 1) return null;

  // 注入先の存在確認(resolve()と同じtraversalガードを流用)
  const real = path.resolve(PROCESS_OWNED_DIR, CYCLE_HOIST_TARGET_MODULE);
  if (path.relative(PROCESS_OWNED_DIR, real).startsWith('..')) return null;
  if (!existsSync(real)) return null;

  const hoistedImportLine = `import * as __bunfsHoisted_0 from ${JSON.stringify(pathToFileURL(real).href)};\n`;
  const newSource = source.replace(CYCLE_HOIST_TARGET_DECL, CYCLE_HOIST_REPLACEMENT);
  return { hoistedImportLine, source: newSource };
}

function buildImportMetaRequirePolyfillPrelude(anchorUrl) {
  return (
    `import __bunfsGuardedChildProcess from ${JSON.stringify(pathToFileURL(CHILD_PROCESS_GUARD_PATH).href)};\n` +
    `import __bunfsGuardedVm from ${JSON.stringify(pathToFileURL(VM_GUARD_PATH).href)};\n` +
    `import { createRequire as __bunfsCreateRequire } from "node:module";\n` +
    `import __bunfsMetaRequirePath from "node:path";\n` +
    `import { existsSync as __bunfsMetaRequireExistsSync } from "node:fs";\n` +
    `const __bunfsRealRequire = __bunfsCreateRequire(${JSON.stringify(anchorUrl)});\n` +
    `const __bunfsOwnedDir = ${JSON.stringify(PROCESS_OWNED_DIR)};\n` +
    `const __bunfsMetaRequire = (id) => {\n` +
    `  if (id === "child_process" || id === "node:child_process") return __bunfsGuardedChildProcess;\n` +
    `  if (id === "vm" || id === "node:vm") return __bunfsGuardedVm;\n` +
    `  if (typeof id === "string" && id.startsWith("/$bunfs/root/")) {\n` +
    `    const rel = id.slice("/$bunfs/root/".length);\n` +
    `    if (rel.includes("..") || __bunfsMetaRequirePath.isAbsolute(rel)) {\n` +
    `      throw new Error("bunfs meta-require: rejected specifier " + id);\n` +
    `    }\n` +
    `    const real = __bunfsMetaRequirePath.resolve(__bunfsOwnedDir, rel);\n` +
    `    if (__bunfsMetaRequirePath.relative(__bunfsOwnedDir, real).startsWith("..")) {\n` +
    `      throw new Error("bunfs meta-require: path escapes process-owned dir: " + id);\n` +
    `    }\n` +
    `    if (!__bunfsMetaRequireExistsSync(real)) {\n` +
    `      throw new Error("bunfs meta-require: missing extracted module " + id + " -> " + real);\n` +
    `    }\n` +
    `    return __bunfsRealRequire(real);\n` +
    `  }\n` +
    `  return __bunfsRealRequire(id);\n` +
    `};\n`
  );
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'child_process' || specifier === 'node:child_process') {
    return { url: pathToFileURL(CHILD_PROCESS_GUARD_PATH).href, shortCircuit: true, format: 'module' };
  }
  if (specifier === 'vm' || specifier === 'node:vm') {
    return { url: pathToFileURL(VM_GUARD_PATH).href, shortCircuit: true, format: 'module' };
  }
  if (specifier === 'ws') {
    return { url: pathToFileURL(WS_STUB_PATH).href, shortCircuit: true, format: 'module' };
  }
  if (specifier.startsWith('/$bunfs/root/')) {
    const rel = specifier.slice('/$bunfs/root/'.length);
    if (rel.includes('..') || path.isAbsolute(rel)) {
      throw new Error(`bunfs resolve: rejected specifier ${specifier}`);
    }
    const real = path.resolve(PROCESS_OWNED_DIR, rel);
    if (path.relative(PROCESS_OWNED_DIR, real).startsWith('..')) {
      throw new Error(`bunfs resolve: path escapes process-owned dir: ${specifier}`);
    }
    if (!existsSync(real)) {
      throw new Error(`bunfs resolve: missing extracted module ${specifier} -> ${real}`);
    }
    return { url: pathToFileURL(real).href, shortCircuit: true, format: 'module' };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const ownedPrefix = pathToFileURL(PROCESS_OWNED_DIR + path.sep).href;
  if (!url.startsWith(ownedPrefix)) {
    return nextLoad(url, context);
  }
  const filePath = fileURLToPath(url);
  let source = readFileSync(filePath, 'utf8');

  let hoistedImportLine = '';
  const hoistResult = tryHoistCycleBreakingImport(filePath, source);
  if (hoistResult) {
    hoistedImportLine = hoistResult.hoistedImportLine;
    source = hoistResult.source;
  }

  if (source.includes('import.meta.require')) {
    const anchorUrl = pathToFileURL(SOURCE_BIN).href;
    source = hoistedImportLine +
      buildImportMetaRequirePolyfillPrelude(anchorUrl) +
      source.replaceAll('import.meta.require', '__bunfsMetaRequire');
  } else if (hoistedImportLine) {
    source = hoistedImportLine + source;
  }
  return { format: 'module', source, shortCircuit: true };
}
