module.exports = function createBunCellSegmenterShim({ stringWidth, graphemeWidth }) {
  // Constants and bit masks (from vendor bundle analysis)
  const fl = 17;  // styleId shift
  const Fo = 2;   // hyperlink shift
  const kr = 32767;  // hyperlink mask (15 bits)
  const pn = 3;   // width mask (2 bits)
  const Ub = 10;  // runIndex shift
  const fC = 255; // width mask (8 bits)
  const dC = 256; // tab flag bit
  const hC = 2048;    // sgrKeys.length threshold for resetNative
  const Dd = 16384;   // uris/graphemes length threshold for resetNative

  // BiDi control character codepoint ranges (U+061C, U+202A-U+202E, U+2066-U+2069)
  const aXe = [[1564, 1564], [8234, 8238], [8294, 8297]];

  // Build regex for BiDi control character detection
  const Nc = aXe.map(([n, s]) => `\\u{${n.toString(16)}}` + (s > n ? `-\\u{${s.toString(16)}}` : '')).join('');
  const mSn = new RegExp(`[${Nc}]`, 'gu');

  // SGR code regex: ESC[<n>m, ESC[<n>;5;<n>m, or ESC[<n>;2;<r>;<g>;<b>m
  const mC = /^\x1b\[(?:\d{1,3})(?:;5;\d{1,3}|;2;\d{1,3};\d{1,3};\d{1,3})?m$/;

  // ANSI SGR pattern for parsing
  const sgrPattern = /\x1b\[([0-9;]*?)m/g;

  // ============================================================
  // sliceAnsi: Split string by display columns using grapheme units (Bug 3 fix)
  // ============================================================
  function sliceAnsi(str, start, end) {
    let visibleCol = 0;
    let result = '';
    let i = 0;

    // Use Intl.Segmenter for proper grapheme unit handling
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

    while (i < str.length) {
      // Check for ESC sequence (SGR code: \x1b[...m)
      if (str[i] === '\x1b' && str[i + 1] === '[') {
        // Find the end of the escape sequence (ends with 'm')
        let j = i + 2;
        while (j < str.length && str[j] !== 'm') {
          j++;
        }
        if (j < str.length && str[j] === 'm') {
          // Found complete SGR code
          const escSeq = str.slice(i, j + 1);
          result += escSeq;
          i = j + 1;
          continue;
        }
      }

      // Regular character: extract as grapheme using Intl.Segmenter
      const graphemeIter = segmenter.segment(str.slice(i));
      const firstGrapheme = Array.from(graphemeIter)[0];
      if (!firstGrapheme) {
        break;
      }

      const grapheme = firstGrapheme.segment;
      const charWidth = graphemeWidth(grapheme);
      const nextCol = visibleCol + charWidth;

      // Include if entirely within [start, end)
      if (nextCol <= end && visibleCol < end) {
        if (visibleCol >= start) {
          result += grapheme;
        }
        visibleCol = nextCol;
      } else if (visibleCol >= end) {
        break;
      } else {
        visibleCol = nextCol;
      }

      i += grapheme.length;
    }

    return result;
  }

  // ============================================================
  // sleepSync: Sleep using Atomics.wait (blocking)
  // ============================================================
  function sleepSync(ms) {
    const buf = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(buf, 0, 0, ms);
  }

  // ============================================================
  // CellSegmenter: Main text segmentation and painting class
  // ============================================================
  class CellSegmenter {
    constructor(config) {
      this.ambiguousIsNarrow = config.ambiguousIsNarrow ?? true;
      this.substitute = config.substitute || [];
      this.screen = config.screen || {
        widthMask: pn,
        narrow: 0,
        wide: 1,
        spacerTail: 2,
        spacerHead: 3,
        emptyCharIndex: 0,
        spacerCharIndex: 1,
        emptyWord: 0,
        tabWidth: 8,
      };

      // GraphemeIndex to charPoolIndex mapping (per-instance state)
      this.graphemes = [];
      this.sgrKeys = [''];  // Index 0 = default (no style applied)
      this.sgrCloseKeys = [''];
      this.uris = [];
    }

    // ============================================================
    // setCell: Write single cell to destination buffer
    // ============================================================
    setCell(destCells, destWidth, x, y, charPoolIndex, packedStyleHyperlinkWidth) {
      // Clamp to screen width
      if (x < 0 || x >= destWidth || y < 0) {
        return 0;
      }

      // Calculate cell index: must bind the shift result before adding 1
      const idx = (y * destWidth + x) << 1;
      if (idx + 1 >= destCells.length) {
        return 0;  // Out of bounds
      }

      destCells[idx] = charPoolIndex;
      destCells[idx + 1] = packedStyleHyperlinkWidth;

      // Return damage rect: xStart * 2^20 + endCol * 2^36
      const xStart = x;
      const endCol = x + 1;
      return endCol + xStart * (2 ** 20) + endCol * (2 ** 36);
    }

    // ============================================================
    // segment: Parse text into grapheme cells, SGR styles, and URIs (Bug 1, 2 fixes)
    // ============================================================
    segment(text, cells, runs, reordered) {
      if (this.graphemes.length > 4 * Dd || this.sgrKeys.length > Dd || this.uris.length > Dd) {
        // Reset and start fresh
        this.graphemes = [];
        this.sgrKeys = [];
        this.sgrCloseKeys = [];
        this.uris = [];
      }

      // Apply BiDi character substitution
      const processedText = text.replace(mSn, '�');

      // Extract SGR codes and their positions first
      const sgrMatches = [];
      let m;
      sgrPattern.lastIndex = 0;
      while ((m = sgrPattern.exec(processedText)) !== null) {
        sgrMatches.push({ code: m[1], index: m.index, length: m[0].length });
      }

      // Remove SGR codes to get clean text for grapheme segmentation
      let cleanText = processedText;
      for (let i = sgrMatches.length - 1; i >= 0; i--) {
        const match = sgrMatches[i];
        cleanText = cleanText.slice(0, match.index) + cleanText.slice(match.index + match.length);
      }

      // Split clean text into grapheme units
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const graphemeSegments = Array.from(segmenter.segment(cleanText)).map(seg => seg.segment);

      // Pre-calculate total grapheme count (Bug 2 fix: pre-check before loop)
      const totalGraphemes = graphemeSegments.length;
      if (cells.length < totalGraphemes * 2) {
        return -(totalGraphemes);  // Must have enough space for all graphemes
      }
      if (runs.length < totalGraphemes * 2) {
        return -(totalGraphemes);
      }

      // Map clean text position to original text position (accounting for SGR codes)
      const cleanPosToOriginalPos = new Array(cleanText.length + 1).fill(0);
      let cleanPos = 0;
      let sgrIdx = 0;

      for (let i = 0; i < processedText.length; i++) {
        if (sgrIdx < sgrMatches.length && i === sgrMatches[sgrIdx].index) {
          // Skip SGR code
          i += sgrMatches[sgrIdx].length - 1;
          sgrIdx++;
        } else {
          // Character at position i in processedText maps to cleanPos in cleanText
          cleanPosToOriginalPos[cleanPos] = i;
          cleanPos++;
        }
      }
      cleanPosToOriginalPos[cleanPos] = processedText.length;


      // Process each grapheme and assign it to the correct SGR run (Bug 1 fix)
      let graphemeIndex = this.graphemes.length;
      let cellCount = 0;

      for (let i = 0; i < graphemeSegments.length; i++) {
        const grapheme = graphemeSegments[i];
        // Find which SGR run this grapheme belongs to
        const origPos = cleanPosToOriginalPos[i];
        let runIndexForGrapheme = 0;

        // Find the last SGR code that appears before or at this position
        for (const match of sgrMatches) {
          if (match.index <= origPos) {
            const code = `\x1b[${match.code}m`;
            let runIdx = this.sgrKeys.indexOf(code);
            if (runIdx === -1) {
              runIdx = this.sgrKeys.length;
              this.sgrKeys.push(code);
              this.sgrCloseKeys.push('');
            }
            runIndexForGrapheme = runIdx;
          } else {
            break;
          }
        }

        // Add grapheme to pool
        this.graphemes.push(grapheme);
        const width = stringWidth(grapheme, { ambiguousIsNarrow: this.ambiguousIsNarrow });

        // Build cell entry: graphemeIndex | runIndex<<10 | tabFlag<<8 | width
        cells[cellCount * 2] = graphemeIndex;
        cells[cellCount * 2 + 1] = (runIndexForGrapheme << Ub) | (width & fC);

        // Add tab marker if grapheme is a tab character
        if (grapheme === '\t') {
          cells[cellCount * 2 + 1] |= dC;  // Set bit 8
        }

        graphemeIndex++;
        cellCount++;
      }

      // Build runs array (SGR indices)
      const maxRunIdx = Math.max(0, this.sgrKeys.length - 1);
      for (let i = 0; i <= maxRunIdx; i++) {
        runs[i * 2] = i;      // styleId index
        runs[i * 2 + 1] = 0;  // uri index (0 = no link)
      }

      return cellCount;
    }

    // ============================================================
    // paint: Render segmented cells to destination screen buffer
    // ============================================================
    paint(destCells, destWidth, x, y, srcCells, srcCount, unused, charIndices, runWords) {
      let col = x;
      let minX = x;
      let maxX = x;

      for (let i = 0; i < srcCount; i++) {
        if (col < 0) {
          col++;
          continue;
        }

        if (col >= destWidth) {
          break;
        }

        const graphemeIndex = srcCells[i * 2];
        const width = srcCells[i * 2 + 1] & fC;
        const tab = (srcCells[i * 2 + 1] & dC) !== 0;
        const runIndex = srcCells[i * 2 + 1] >>> Ub;
        const word = runWords[runIndex] || 0;

        // Skip wide characters that would overshoot screen width
        if (width === 2 && col + 1 >= destWidth) {
          break;
        }

        // Calculate cell index: bind result to variable before adding 1
        const idx = (y * destWidth + col) << 1;

        if (tab) {
          // Fill tab stops with spaces (use this.screen.tabWidth, not hardcoded Eut) - Bug 3 fix
          const tabWidth = this.screen.tabWidth || 8;
          const nextTabStop = Math.min(((Math.floor(col / tabWidth) + 1) * tabWidth), destWidth);
          while (col < nextTabStop && col < destWidth) {
            const cellIdx = (y * destWidth + col) << 1;
            destCells[cellIdx] = charIndices[graphemeIndex] || 0;
            destCells[cellIdx + 1] = word | 0;  // width code 0 for space
            col++;
          }
          maxX = col;
        } else {
          destCells[idx] = charIndices[graphemeIndex] || 0;
          destCells[idx + 1] = word | (width === 2 ? 1 : 0);

          if (width === 2) {
            // Wide character: write spacer tail to next cell
            const spacerIdx = idx + 2;
            if (col + 1 < destWidth && spacerIdx + 1 < destCells.length) {
              destCells[spacerIdx] = this.screen.spacerCharIndex;
              destCells[spacerIdx + 1] = word | 2;  // width code 2 (spacerTail)
            }
            col += 2;
            maxX = col;
          } else {
            col++;
            maxX = col;
          }
        }
      }

      // Return damage rect: must use * and + only, not <<
      const endCol = Math.min(col, destWidth);
      const xStart = x;
      return endCol + xStart * (2 ** 20) + endCol * (2 ** 36);
    }
  }

  // ============================================================
  // Return factory exports
  // ============================================================
  return { sliceAnsi, sleepSync, CellSegmenter };
};
