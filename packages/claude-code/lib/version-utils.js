'use strict';

function parseVersion(v) {
  const str = String(v);
  const dashIdx = str.lastIndexOf('-');
  if (dashIdx !== -1) {
    const base = str.slice(0, dashIdx);
    const suffix = Number(str.slice(dashIdx + 1));
    return { parts: base.split('.').map(Number), suffix: isNaN(suffix) ? 0 : suffix };
  }
  return { parts: str.split('.').map(Number), suffix: 0 };
}

function compareVersions(a, b) {
  const ap = parseVersion(a), bp = parseVersion(b);
  const len = Math.max(ap.parts.length, bp.parts.length);
  for (let i = 0; i < len; i++) {
    const diff = (ap.parts[i] || 0) - (bp.parts[i] || 0);
    if (diff !== 0) return diff;
  }
  return ap.suffix - bp.suffix;
}

module.exports = { parseVersion, compareVersions };
