import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

let PROCESS_OWNED_DIR = null;
let SOURCE_BIN = null;
let CHILD_PROCESS_GUARD_PATH = null;
let VM_GUARD_PATH = null;
let WS_STUB_PATH = null;

let CYCLE_HOISTS = [];

export function initialize(data) {
  PROCESS_OWNED_DIR = data.processOwnedDir;
  SOURCE_BIN = data.sourceBin;
  CHILD_PROCESS_GUARD_PATH = data.childProcessGuardPath;
  VM_GUARD_PATH = data.vmGuardPath;
  WS_STUB_PATH = data.wsStubPath;
  CYCLE_HOISTS = Array.isArray(data.cycleHoists) ? data.cycleHoists : [];
}

function tryHoistCycleBreakingImports(filePath, source) {
  const rel = path.relative(PROCESS_OWNED_DIR, filePath);
  const records = CYCLE_HOISTS.filter((r) => r.file === rel);
  if (records.length === 0) return null;

  let hoistedImportLines = '';
  let newSource = source;
  let varIndex = 0;
  const targetToVar = new Map();

  for (const record of records) {
    const literal = `import.meta.require("/$bunfs/root/${record.targetModule}")`;
    const occurrences = newSource.split(literal).length - 1;
    if (occurrences !== record.expectedOccurrences) continue;

    const real = path.resolve(PROCESS_OWNED_DIR, record.targetModule);
    if (path.relative(PROCESS_OWNED_DIR, real).startsWith('..')) continue;
    if (!existsSync(real)) continue;

    let varName = targetToVar.get(record.targetModule);
    if (!varName) {
      varName = `__bunfsHoisted_${varIndex++}`;
      targetToVar.set(record.targetModule, varName);
      hoistedImportLines += `import * as ${varName} from ${JSON.stringify(pathToFileURL(real).href)};\n`;
      if (record.assertProperties && record.assertProperties.length > 0) {
        hoistedImportLines += `__bunfsAssertHoistedProps(${varName}, ${JSON.stringify(record.targetModule)}, ${JSON.stringify(record.assertProperties)});\n`;
      }
    }
    newSource = newSource.replaceAll(literal, varName);
  }

  if (!targetToVar.size) return null;
  return { hoistedImportLine: hoistedImportLines, source: newSource };
}

function buildImportMetaRequirePolyfillPrelude(anchorUrl) {
  return (
    `import __bunfsGuardedChildProcess from ${JSON.stringify(pathToFileURL(CHILD_PROCESS_GUARD_PATH).href)};\n` +
    `import __bunfsGuardedVm from ${JSON.stringify(pathToFileURL(VM_GUARD_PATH).href)};\n` +
    `import { createRequire as __bunfsCreateRequire } from "node:module";\n` +
    `import __bunfsMetaRequirePath from "node:path";\n` +
    `import { existsSync as __bunfsMetaRequireExistsSync } from "node:fs";\n` +
    `import { readFileSync as __bunfsMetaRequireReadFileSync } from "node:fs";\n` +
    `function __bunfsAssertHoistedProps(ns, targetModule, propNames) {\n` +
    `  for (const p of propNames) {\n` +
    `    let v;\n` +
    `    try {\n` +
    `      v = ns[p];\n` +
    `    } catch (e) {\n` +
    `      if (e instanceof ReferenceError) {\n` +
    `        throw new Error("bunfs cycle-hoist: accessing \\"" + p + "\\" on " + targetModule + " threw ReferenceError (TDZ) - evaluation-order regression");\n` +
    `      }\n` +
    `      throw e;\n` +
    `    }\n` +
    `    if (v === undefined) {\n` +
    `      throw new Error("bunfs cycle-hoist: \\"" + p + "\\" is undefined after hoisting from " + targetModule + " (evaluation-order regression?)");\n` +
    `    }\n` +
    `  }\n` +
    `}\n` +
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
    `    const ext = __bunfsMetaRequirePath.extname(real);\n` +
    `    if (ext === ".md" || ext === ".txt") {\n` +
    `      return __bunfsMetaRequireReadFileSync(real, "utf8");\n` +
    `    }\n` +
    `    return __bunfsRealRequire(real);\n` +
    `  }\n` +
    `  return __bunfsRealRequire(id);\n` +
    `};\n`
  );
}

export function resolve(specifier, context, nextResolve) {
  const parentURL = context && context.parentURL;
  const ownedPrefix = pathToFileURL(PROCESS_OWNED_DIR + path.sep).href;
  const fromChunk = typeof parentURL === 'string' && parentURL.startsWith(ownedPrefix);

  if (fromChunk) {
    if (specifier === 'child_process' || specifier === 'node:child_process') {
      return { url: pathToFileURL(CHILD_PROCESS_GUARD_PATH).href, shortCircuit: true, format: 'module' };
    }
    if (specifier === 'vm' || specifier === 'node:vm') {
      return { url: pathToFileURL(VM_GUARD_PATH).href, shortCircuit: true, format: 'module' };
    }
    if (specifier === 'ws') {
      return { url: pathToFileURL(WS_STUB_PATH).href, shortCircuit: true, format: 'module' };
    }
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

export function load(url, context, nextLoad) {
  const ownedPrefix = pathToFileURL(PROCESS_OWNED_DIR + path.sep).href;
  if (!url.startsWith(ownedPrefix)) {
    return nextLoad(url, context);
  }
  const filePath = fileURLToPath(url);
  let source = readFileSync(filePath, 'utf8');

  let hoistedImportLine = '';
  const hoistResult = tryHoistCycleBreakingImports(filePath, source);
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
