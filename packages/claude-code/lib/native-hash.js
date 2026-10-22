'use strict';

const crypto = require('crypto');
const fs = require('fs');

function verifyTarball(file, audited, version = 'unknown') {
  if (!audited || typeof audited !== 'object' || !audited.tarball_sha256 || !audited.tarball_integrity) {
    throw new Error(`audited tarball identity is incomplete for ${version}`);
  }
  const buf = fs.readFileSync(file);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const integrity = `sha512-${crypto.createHash('sha512').update(buf).digest('base64')}`;
  if (sha256 !== audited.tarball_sha256) throw new Error(`tarball sha256 mismatch for ${version}`);
  if (integrity !== audited.tarball_integrity) throw new Error(`tarball integrity mismatch for ${version}`);
  return { sha256, integrity, size: buf.length };
}

module.exports = { verifyTarball };
