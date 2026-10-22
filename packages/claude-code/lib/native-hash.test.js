'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { verifyTarball } = require('./native-hash');

test('native-hash verifies required sha256 and integrity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-hash-'));
  try {
    const file = path.join(dir, 'pkg.tgz');
    fs.writeFileSync(file, 'tarball fixture');
    const bytes = fs.readFileSync(file);
    const identity = {
      tarball_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      tarball_integrity: `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`,
    };
    assert.equal(verifyTarball(file, identity, '1.2.3').sha256, identity.tarball_sha256);
    assert.throws(() => verifyTarball(file, { tarball_integrity: identity.tarball_integrity }, '1.2.3'), /incomplete/);
    assert.throws(() => verifyTarball(file, { ...identity, tarball_sha256: '0'.repeat(64) }, '1.2.3'), /sha256 mismatch/);
    assert.throws(() => verifyTarball(file, { ...identity, tarball_integrity: 'sha512-invalid' }, '1.2.3'), /integrity mismatch/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
