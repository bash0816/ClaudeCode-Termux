// Faithful re-implementation of the vendor-side consumer (class _d) from
// cellsegmenter-extracted-functions.js, so we can exercise the shim exactly
// the way claude-code 2.1.272 does.
const createShim = require('../bun-cellsegmenter-shim.js');

// Create shim factory that accepts stringWidth and graphemeWidth
function createHarness(stringWidth, graphemeWidth) {
  const { CellSegmenter, sliceAnsi, sleepSync } = createShim({
    stringWidth,
    graphemeWidth,
  });

const fl = 17, Fo = 2, kr = 32767, pn = 3, Ub = 10, fC = 255, dC = 256, Eut = 8;
const aXe = [[1564, 1564], [8234, 8238], [8294, 8297]];
function qn(n, s, u) { return n << fl | s << Fo | u; }
function Ys(n, s, u) {
  if (n.length >= s) return n;
  let f = new Int32Array(Math.max(s, 2 * n.length));
  if (u > 0) f.set(n.subarray(0, Math.min(u, n.length)));
  return f;
}
class Pool {
  constructor(seed) { this.arr = seed ? seed.slice() : []; this.map = new Map(); this.arr.forEach((v, i) => this.map.set(v, i)); }
  intern(v) { if (this.map.has(v)) return this.map.get(v); const i = this.arr.length; this.arr.push(v); this.map.set(v, i); return i; }
  get(i) { return this.arr[i]; }
}
function As() {
  return new CellSegmenter({
    ambiguousIsNarrow: true,
    substitute: aXe,
    screen: { widthMask: pn, narrow: 0, wide: 1, spacerTail: 2, spacerHead: 3, emptyCharIndex: 0, spacerCharIndex: 1, emptyWord: qn(0, 0, 0), tabWidth: Eut },
  });
}
// class _d
class D {
  constructor(stylePool, charPool) {
    this.stylePool = stylePool; this.charPool = charPool;
    this.native = As();
    this.cells = new Int32Array(512); this.runs = new Int32Array(512);
    this.count = 0; this.reordered = false;
    this.graphemes = this.native.graphemes;
    this.sgrKeys = this.native.sgrKeys;
    this.sgrCloseKeys = this.native.sgrCloseKeys;
    this.uris = this.native.uris;
    this.charMap = new Int32Array(256); this.charMapLength = 0;
    this.styleIds = new Int32Array(64);
    this.linkIds = new Int32Array(16);
    this.words = new Int32Array(64);
    this.retries = 0;
  }
  segment(n, s) {
    let u = this.native.segment(n, this.cells, this.runs, s);
    if (u < 0) {
      this.retries++;
      let f = Math.max(-u, this.cells.length);
      this.cells = new Int32Array(2 * f); this.runs = new Int32Array(2 * f);
      u = this.native.segment(n, this.cells, this.runs, s);
    }
    this.count = u; this.reordered = s; return u;
  }
  width(n, s, u) {
    let f = this.segment(n, u), p = s;
    for (let y = 0; y < f; y++) {
      let S = this.cells[2 * y + 1];
      p += (S & dC) !== 0 ? Eut - p % Eut : S & fC;
    }
    return p - s;
  }
  charIndices() {
    let n = this.graphemes;
    if (this.charMapLength < n.length) {
      this.charMap = Ys(this.charMap, n.length, this.charMapLength);
      for (let s = this.charMapLength; s < n.length; s++) this.charMap[s] = this.charPool.intern(n[s]);
      this.charMapLength = n.length;
    }
    return this.charMap;
  }
  // verbatim from vendor bundle
  runWords(n) {
    let s = this.count;
    if (s === 0) return this.words;
    if (this.hyperlinkPool !== n) { this.hyperlinkPool = n; this.linkIds.fill(0); }
    let u = this.cells[2 * s - 1] >>> Ub;
    if (this.reordered) for (let p = 0; p < s; p++) u = Math.max(u, this.cells[2 * p + 1] >>> Ub);
    let f = u + 1;
    this.words = Ys(this.words, f, 0);
    this.runCount = f;
    for (let p = 0; p < f; p++) {
      let y = this.runs[2 * p + 1], S = 0;
      if (y !== 0) {
        if (this.linkIds = Ys(this.linkIds, y + 1, this.linkIds.length), S = this.linkIds[y], S === 0)
          S = n.intern(this.uris[y]) + 1, this.linkIds[y] = S;
        S -= 1;
      }
      this.words[p] = qn(this.styleId(this.runs[2 * p]), S, 0);
    }
    return this.words;
  }
  paint(n, s, u, f, p) {
    return this.native.paint(n, s, u, f, this.cells, this.count, void 0, this.charIndices(), this.runWords(p));
  }
  // ansiCodes / styleId per vendor bundle
  ansiCodes(n) {
    if (n === 0) return [];
    let s = this.sgrKeys[n].split('\x00'), u = this.sgrCloseKeys[n].split('\x00'), f = [];
    for (let p = 0; p < s.length; p++) {
      let y = s[p];
      if (mC.test(y)) f.push({ type: 'ansi', code: y, endCode: u[p] });
    }
    return f;
  }
  styleId(n) {
    this.styleIds = Ys(this.styleIds, n + 1, this.styleIds.length);
    let s = this.styleIds[n];
    if (s === 0) { s = this.stylePool.intern(JSON.stringify(this.ansiCodes(n))) + 1; this.styleIds[n] = s; }
    return s - 1;
  }
}
const mC = /^\x1b\[(?:\d{1,3})(?:;5;\d{1,3}|;2;\d{1,3};\d{1,3};\d{1,3})?m$/;

// Y0 damage decode
function Y0(u) {
  let f = Math.floor(u / 1048576) % 65536;
  let p = Math.floor(u / 68719476736);
  if (f >= p) return null;
  return { x: f, width: p - f };
}

function mkScreen(width, height) {
  return { width, height, cells: new Int32Array(width * height * 2) };
}
function readCell(screen, charPool, hyperPool, x, y) {
  const i = (y * screen.width + x) << 1;
  const p = screen.cells[i + 1];
  const h = p >>> Fo & kr;
  return { char: charPool.get(screen.cells[i]), styleId: p >>> fl, width: p & pn, hyperlink: h === 0 ? undefined : hyperPool.get(h) };
}

  return { CellSegmenter, sliceAnsi, sleepSync, D, Pool, As, qn, Y0, mkScreen, readCell, mC, fl, Fo, kr, pn, Ub, fC, dC };
}

module.exports = createHarness;
