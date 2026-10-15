'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const r = require('./patchelf-runtime');

const FLOCK = r.termuxPaths().flock;
const SKIP = fs.existsSync(FLOCK) ? false : 'flock not available';
const GEN_A = 'gen-0123456789abcdef-test';
const GEN_B = 'gen-fedcba9876543210-test';
const DAY = 86400000;
const NOW = Date.now();

function makeVersion(patchRoot, name, { lastUsedAgeDays, gens = [], current = null } = {}) {
  const dir = path.join(patchRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'prepare.lock'), '');
  for (const gen of gens) {
    fs.mkdirSync(path.join(dir, gen));
    fs.writeFileSync(path.join(dir, gen, '.inuse'), '');
  }
  if (current) fs.symlinkSync(current, path.join(dir, 'current'));
  if (lastUsedAgeDays !== undefined) {
    const file = path.join(dir, '.last-used');
    fs.writeFileSync(file, '');
    const seconds = (NOW - lastUsedAgeDays * DAY) / 1000;
    fs.utimesSync(file, seconds, seconds);
  }
  return dir;
}

function skippedMap(result) {
  return Object.fromEntries(result.skipped.map((s) => [s.version, s.reason]));
}

test('gcVersions keeps the current version, recently used versions, and versions without .last-used', { skip: SKIP }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-vgc-'));
  try {
    const patchRoot = path.join(root, 'patchelf');
    const currentDir = makeVersion(patchRoot, '2.0.0', { lastUsedAgeDays: 30, gens: [GEN_A], current: GEN_A });
    const recentDir = makeVersion(patchRoot, '1.0.0', { lastUsedAgeDays: 3, gens: [GEN_B], current: GEN_B });
    const noUsedDir = makeVersion(patchRoot, '0.9.0', { gens: [GEN_A] });
    const result = r.gcVersions({ patchRoot, currentVersion: '2.0.0', flockPath: FLOCK, now: NOW });
    assert.deepEqual(result.removedVersions, []);
    assert.deepEqual(skippedMap(result), { '2.0.0': 'current', '1.0.0': 'recent', '0.9.0': 'no-last-used' });
    assert.ok(fs.existsSync(path.join(currentDir, GEN_A, '.inuse')));
    assert.ok(fs.existsSync(path.join(recentDir, GEN_B, '.inuse')));
    assert.ok(fs.existsSync(path.join(noUsedDir, GEN_A, '.inuse')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gcVersions removes generations and current link of an old unlocked version while keeping prepare.lock and the version dir', { skip: SKIP }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-vgc-'));
  try {
    const patchRoot = path.join(root, 'patchelf');
    const dir = makeVersion(patchRoot, '1.0.0', { lastUsedAgeDays: 30, gens: [GEN_A, GEN_B], current: GEN_A });
    const lockIno = fs.statSync(path.join(dir, 'prepare.lock')).ino;
    const result = r.gcVersions({ patchRoot, currentVersion: '2.0.0', flockPath: FLOCK, now: NOW });
    assert.deepEqual(result.removedVersions, ['1.0.0']);
    assert.deepEqual(result.skipped, []);
    assert.equal(fs.existsSync(dir), true);
    assert.equal(fs.statSync(path.join(dir, 'prepare.lock')).ino, lockIno);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['prepare.lock']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gcVersions skips a version whose generation is held by a shared .inuse lock', { skip: SKIP }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-vgc-'));
  let holder;
  try {
    const patchRoot = path.join(root, 'patchelf');
    const dir = makeVersion(patchRoot, '1.0.0', { lastUsedAgeDays: 30, gens: [GEN_A] });
    const inuse = path.join(dir, GEN_A, '.inuse');
    holder = spawn(FLOCK, ['-s', inuse, '-c', 'echo ready; exec sleep 30'], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    await new Promise((resolve, reject) => {
      let out = '';
      holder.stdout.on('data', (chunk) => { out += chunk; if (out.includes('ready')) resolve(); });
      holder.once('error', reject);
      holder.once('exit', (code) => reject(new Error(`lock holder exited early with ${code}`)));
    });
    const result = r.gcVersions({ patchRoot, currentVersion: '2.0.0', flockPath: FLOCK, now: NOW });
    assert.deepEqual(result.removedVersions, []);
    assert.deepEqual(result.skipped, [{ version: '1.0.0', reason: 'locked' }]);
    assert.equal(fs.existsSync(path.join(dir, GEN_A, '.inuse')), true);
    assert.equal(fs.existsSync(path.join(dir, '.last-used')), true);
  } finally {
    if (holder && holder.exitCode === null && holder.signalCode === null) {
      await new Promise((resolve) => {
        holder.once('exit', resolve);
        try { process.kill(-holder.pid, 'SIGKILL'); } catch { resolve(); }
      });
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gcVersions never touches shell, gen-* entries at the patch root, dot entries, or regular files', { skip: SKIP }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-vgc-'));
  try {
    const patchRoot = path.join(root, 'patchelf');
    const shellDir = path.join(patchRoot, 'shell');
    fs.mkdirSync(path.join(shellDir, 'wid123'), { recursive: true });
    fs.writeFileSync(path.join(shellDir, 'wid123', 'run'), 'saved');
    const shellMarker = path.join(shellDir, '.last-used');
    fs.writeFileSync(shellMarker, '');
    const oldSeconds = (NOW - 30 * DAY) / 1000;
    fs.utimesSync(shellMarker, oldSeconds, oldSeconds);
    const looseGen = path.join(patchRoot, GEN_A);
    fs.mkdirSync(looseGen, { recursive: true });
    const hiddenDir = makeVersion(patchRoot, '.hidden', { lastUsedAgeDays: 30, gens: [GEN_B] });
    fs.writeFileSync(path.join(patchRoot, 'README'), 'x');
    const result = r.gcVersions({ patchRoot, currentVersion: '2.0.0', flockPath: FLOCK, now: NOW });
    assert.deepEqual(result.removedVersions, []);
    assert.deepEqual(result.skipped, []);
    assert.equal(fs.readFileSync(path.join(shellDir, 'wid123', 'run'), 'utf8'), 'saved');
    assert.equal(fs.existsSync(shellMarker), true);
    assert.equal(fs.existsSync(looseGen), true);
    assert.equal(fs.existsSync(path.join(hiddenDir, GEN_B, '.inuse')), true);
    assert.equal(fs.existsSync(path.join(patchRoot, 'README')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
