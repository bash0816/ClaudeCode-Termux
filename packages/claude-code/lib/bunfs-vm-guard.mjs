import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const realVm = require('node:vm');

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

export const createContext = realVm.createContext;
export const isContext = realVm.isContext;
export const runInContext = realVm.runInContext;
export const runInNewContext = realVm.runInNewContext;
export const runInThisContext = realVm.runInThisContext;
export const createScript = realVm.createScript;
export const compileFunction = realVm.compileFunction;
export const measureMemory = realVm.measureMemory;
export const Script = realVm.Script;
export const SourceTextModule = realVm.SourceTextModule;
export const SyntheticModule = realVm.SyntheticModule;
export const constants = realVm.constants;

export default realVm;
