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

function buildImportMetaRequirePolyfillPrelude(anchorUrl) {
  return (
    `import __bunfsGuardedChildProcess from ${JSON.stringify(pathToFileURL(CHILD_PROCESS_GUARD_PATH).href)};\n` +
    `import __bunfsGuardedVm from ${JSON.stringify(pathToFileURL(VM_GUARD_PATH).href)};\n` +
    `import { createRequire as __bunfsCreateRequire } from "node:module";\n` +
    `const __bunfsRealRequire = __bunfsCreateRequire(${JSON.stringify(anchorUrl)});\n` +
    `const __bunfsMetaRequire = (id) => {\n` +
    `  if (id === "child_process" || id === "node:child_process") return __bunfsGuardedChildProcess;\n` +
    `  if (id === "vm" || id === "node:vm") return __bunfsGuardedVm;\n` +
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
  if (source.includes('import.meta.require')) {
    const anchorUrl = pathToFileURL(SOURCE_BIN).href;
    source = buildImportMetaRequirePolyfillPrelude(anchorUrl) +
      source.replaceAll('import.meta.require', '__bunfsMetaRequire');
  }
  return { format: 'module', source, shortCircuit: true };
}
