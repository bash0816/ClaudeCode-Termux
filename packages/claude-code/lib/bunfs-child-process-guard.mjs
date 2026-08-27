import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const realChildProcess = require('node:child_process');
const { createGuardedChildProcess } = require('./native-update-guard.js');
const guarded = createGuardedChildProcess(realChildProcess, (v) => process.stderr.write(v));

export const spawn = guarded.spawn;
export const execFile = guarded.execFile;
export const exec = guarded.exec;
export const spawnSync = guarded.spawnSync;
export const execFileSync = guarded.execFileSync;
export const execSync = guarded.execSync;
export const ChildProcess = realChildProcess.ChildProcess;
export const fork = realChildProcess.fork;
export const _forkChild = realChildProcess._forkChild;

export default Object.assign({}, realChildProcess, guarded);
