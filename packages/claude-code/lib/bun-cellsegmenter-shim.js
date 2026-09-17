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

  // Intl.Segmenter instance for grapheme segmentation (reuse across calls)
  const globalSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

  // ============================================================
  // sliceAnsi: Split string by display columns using grapheme units
  // ============================================================
  function sliceAnsi(str, start, end) {
    let visibleCol = 0;
    let result = '';
    let i = 0;

    // Regex for non-SGR CSI sequences: ESC [ ... (@ to ~, excluding m)
    const csiNonSgrRegex = /^\x1b\[[0-?]*[ -/]*[@-~]/;

    while (i < str.length) {
      // Invariant: must advance i by at least 1 per iteration
      // Four-way dispatch with catch-all fallback (§9-6)

      // 1. Complete SGR code: \x1b[...m with params (\d, ;, :)
      if (str[i] === '\x1b' && str[i + 1] === '[') {
        let j = i + 2;
        // Find 'm' terminator, accepting digits, ;, and : (colon for kitty underline)
        while (j < str.length && /[\d;:]/.test(str[j])) {
          j++;
        }
        if (j < str.length && str[j] === 'm') {
          // Match complete SGR
          result += str.slice(i, j + 1);
          i = j + 1;
          continue;
        }
        // Otherwise fall through to catch-all
      }

      // 2. Complete OSC8 sequence: \x1b]8;;...BEL or \x1b]8...ST
      if (str[i] === '\x1b' && str[i + 1] === ']' && str[i + 2] === '8' && str[i + 3] === ';') {
        let j = i + 4;
        let foundEnd = false;
        while (j < str.length) {
          if (str[j] === '\x07') {
            // BEL terminator
            result += str.slice(i, j + 1);
            i = j + 1;
            foundEnd = true;
            break;
          }
          if (str[j] === '\x1b' && j + 1 < str.length && str[j + 1] === '\\') {
            // ST terminator
            result += str.slice(i, j + 2);
            i = j + 2;
            foundEnd = true;
            break;
          }
          j++;
        }
        if (foundEnd) continue;
        // Otherwise fall through to catch-all (incomplete OSC8)
      }

      // 3. Non-SGR CSI sequence: match and skip (skip without adding to result)
      if (str[i] === '\x1b' && str[i + 1] === '[') {
        const remaining = str.slice(i);
        const csiMatch = remaining.match(csiNonSgrRegex);
        if (csiMatch) {
          // Skip CSI sequence without adding to result (consumed but not output)
          i += csiMatch[0].length;
          continue;
        }
        // Otherwise fall through to catch-all (malformed CSI)
      }

      // 4. Catch-all: any other character (ESC alone or normal char)
      // Distinguish between lone ESC and normal text
      if (str[i] === '\x1b') {
        // Single ESC character (incomplete sequence) - consume it as-is
        result += str[i];
        i += 1;
        continue;
      }

      // Normal character: find the next ESC and segment everything up to it
      let chunkEnd = str.length;  // Default: rest of string (no more ESCs)
      for (let j = i + 1; j < str.length; j++) {
        if (str[j] === '\x1b') {
          chunkEnd = j;
          break;
        }
      }

      const chunk = str.slice(i, chunkEnd);
      const graphemes = Array.from(globalSegmenter.segment(chunk)).map(seg => seg.segment);

      for (const grapheme of graphemes) {
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
      }

      if (visibleCol >= end) {
        break;
      }

      i = chunkEnd;
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
      this.uris = [''];  // Index 0 = no link (reserved dummy), per §9-2
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
    // segment: Parse text into grapheme cells, SGR styles, and URIs (BL-1,2,3,4,5,6,7 fixes)
    // ============================================================
    segment(text, cells, runs, reordered) {
      // Apply BiDi character substitution
      const processedText = text.replace(mSn, '�');

      // Pre-allocate capacity check
      const estimatedGraphemes = processedText.length;
      if (cells.length < estimatedGraphemes * 2) {
        return -(estimatedGraphemes);
      }
      if (runs.length < estimatedGraphemes * 2) {
        return -(estimatedGraphemes);
      }

      let graphemeIndex = this.graphemes.length;
      let cellCount = 0;
      let localRunIndex = 0;
      let currentUri = 0;

      // Track current active style attributes by category (§9-4, BL-6)
      let fgColor = null;     // Current foreground color code (null = none)
      let bgColor = null;     // Current background color code (null = none)
      const booleanAttrs = new Set();  // bold, dim, italic, underline, blink, reverse, hidden, strikethrough

      // Track run states to fill runs array later
      const runToState = new Map();  // Map of runIdx -> {sgrCodes, uriIdx}

      // Helper: build SGR code array from current state
      const buildSgrCodes = () => {
        const codes = [];
        if (fgColor !== null) codes.push(fgColor);
        if (bgColor !== null) codes.push(bgColor);
        for (const attr of booleanAttrs) codes.push(attr);
        return codes.sort();
      };

      // Helper: get close codes corresponding to open codes (§9-5)
      // Returns codes in escape sequence format: \x1b[...m (not raw codes)
      const getCloseCodes = (openCodes) => {
        const closeMap = {
          '1': '22', '2': '22',
          '3': '23', '4': '24', '5': '25', '6': '25',
          '7': '27', '8': '28', '9': '29'
        };
        return openCodes.map(code => {
          let closeCode = '';
          // Check for composite color codes first
          if (/^38/.test(code)) closeCode = '39';  // Foreground color (38;5;n or 38;2;r;g;b)
          else if (/^48/.test(code)) closeCode = '49';  // Background color (48;5;n or 48;2;r;g;b)
          // Check for basic foreground colors (30-37, 90-97)
          else if (/^(30|31|32|33|34|35|36|37|90|91|92|93|94|95|96|97)$/.test(code)) closeCode = '39';
          // Check for basic background colors (40-47, 100-107)
          else if (/^(40|41|42|43|44|45|46|47|100|101|102|103|104|105|106|107)$/.test(code)) closeCode = '49';
          // Check for other attributes
          else if (/^\d+$/.test(code)) closeCode = closeMap[code] || '';
          // Return as escape sequence: \x1b[...m, or empty if no mapping
          return closeCode ? `\x1b[${closeCode}m` : '';
        });
      };

      // Helper: parse SGR parameter and update state (BL-6)
      const applySgrParam = (param) => {
        if (param === '0' || param === '') {
          fgColor = null;
          bgColor = null;
          booleanAttrs.clear();
        } else if (param === '1' || param === '2') {
          booleanAttrs.add(param);
        } else if (param === '3') {
          booleanAttrs.add(param);
        } else if (param === '4') {
          booleanAttrs.add(param);
        } else if (param === '5' || param === '6') {
          booleanAttrs.add(param);
        } else if (param === '7') {
          booleanAttrs.add(param);
        } else if (param === '8') {
          booleanAttrs.add(param);
        } else if (param === '9') {
          booleanAttrs.add(param);
        } else if (param === '22') {
          booleanAttrs.delete('1');
          booleanAttrs.delete('2');
        } else if (param === '23') {
          booleanAttrs.delete('3');
        } else if (param === '24') {
          booleanAttrs.delete('4');
        } else if (param === '25') {
          booleanAttrs.delete('5');
          booleanAttrs.delete('6');
        } else if (param === '27') {
          booleanAttrs.delete('7');
        } else if (param === '28') {
          booleanAttrs.delete('8');
        } else if (param === '29') {
          booleanAttrs.delete('9');
        } else if (param === '39') {
          fgColor = null;
        } else if (param === '49') {
          bgColor = null;
        } else if (/^(30|31|32|33|34|35|36|37|90|91|92|93|94|95|96|97)$/.test(param)) {
          fgColor = param;
        } else if (/^(40|41|42|43|44|45|46|47|100|101|102|103|104|105|106|107)$/.test(param)) {
          bgColor = param;
        }
      };

      // Helper: parse full SGR sequence
      const parseSgrSequence = (paramStr) => {
        if (!paramStr) {
          applySgrParam('0');
          return;
        }
        const parts = paramStr.split(';');
        let k = 0;
        while (k < parts.length) {
          const p = parts[k];
          if ((p === '38' || p === '48') && parts[k + 1] === '5' && k + 2 < parts.length) {
            const composite = `${p};5;${parts[k + 2]}`;
            if (p === '38') fgColor = composite;
            else bgColor = composite;
            k += 3;
            continue;
          } else if ((p === '38' || p === '48') && parts[k + 1] === '2' && k + 4 < parts.length) {
            const composite = `${p};2;${parts[k + 2]};${parts[k + 3]};${parts[k + 4]}`;
            if (p === '38') fgColor = composite;
            else bgColor = composite;
            k += 5;
            continue;
          }
          applySgrParam(p);
          k++;
        }
      };

      // Regex for non-SGR CSI sequences (with ^ anchor to match at current position)
      const csiNonSgrRegex = /^\x1b\[[0-?]*[ -/]*[@-~]/;

      let i = 0;
      let prevState = null;  // Previous SGR+URI state for BL-3 (monotonic run allocation)

      while (i < processedText.length) {
        // Invariant: must advance i by at least 1 per iteration (§9-6)
        // Four-way dispatch with catch-all fallback

        // 1. Complete SGR code: \x1b[...m
        if (processedText[i] === '\x1b' && processedText[i + 1] === '[') {
          let j = i + 2;
          while (j < processedText.length && /[\d;:]/.test(processedText[j])) {
            j++;
          }
          if (j < processedText.length && processedText[j] === 'm') {
            const params = processedText.slice(i + 2, j);
            parseSgrSequence(params);
            i = j + 1;
            continue;
          }
        }

        // 2. Complete OSC8 sequence: \x1b]8;;...
        if (processedText[i] === '\x1b' && processedText[i + 1] === ']' && processedText[i + 2] === '8' && processedText[i + 3] === ';') {
          let j = i + 4;
          let foundEnd = false;
          while (j < processedText.length) {
            if (processedText[j] === '\x07') {
              const oscSeq = processedText.slice(i + 4, j);
              const semicolonPos = oscSeq.indexOf(';');
              if (semicolonPos >= 0) {
                const url = oscSeq.slice(semicolonPos + 1);
                if (url) {
                  let uriIdx = this.uris.indexOf(url);
                  if (uriIdx === -1) {
                    uriIdx = this.uris.length;
                    this.uris.push(url);
                  }
                  currentUri = uriIdx;
                } else {
                  currentUri = 0;
                }
              }
              i = j + 1;
              foundEnd = true;
              break;
            }
            if (processedText[j] === '\x1b' && j + 1 < processedText.length && processedText[j + 1] === '\\') {
              const oscSeq = processedText.slice(i + 4, j);
              const semicolonPos = oscSeq.indexOf(';');
              if (semicolonPos >= 0) {
                const url = oscSeq.slice(semicolonPos + 1);
                if (url) {
                  let uriIdx = this.uris.indexOf(url);
                  if (uriIdx === -1) {
                    uriIdx = this.uris.length;
                    this.uris.push(url);
                  }
                  currentUri = uriIdx;
                } else {
                  currentUri = 0;
                }
              }
              i = j + 2;
              foundEnd = true;
              break;
            }
            j++;
          }
          if (foundEnd) continue;
        }

        // 3. Non-SGR CSI sequence: match and skip
        if (processedText[i] === '\x1b' && processedText[i + 1] === '[') {
          const remaining = processedText.slice(i);
          const csiMatch = remaining.match(csiNonSgrRegex);
          if (csiMatch) {
            i += csiMatch[0].length;
            continue;
          }
        }

        // 4. Catch-all: lone ESC or normal character
        // Distinguish between lone ESC and normal text
        if (processedText[i] === '\x1b') {
          // Single ESC character (incomplete sequence) - consume it as-is, don't segment
          i += 1;
          continue;
        }

        // Normal character: find the next ESC and segment everything up to it
        let chunkEnd = processedText.length;  // Default: rest of string (no more ESCs)
        for (let j = i + 1; j < processedText.length; j++) {
          if (processedText[j] === '\x1b') {
            chunkEnd = j;
            break;
          }
        }

        const chunk = processedText.slice(i, chunkEnd);
        const graphemeArray = Array.from(globalSegmenter.segment(chunk)).map(seg => seg.segment);

        for (const grapheme of graphemeArray) {
          // Determine run index: compare current state with previous (BL-3)
          const currentSgrCodes = buildSgrCodes();
          const currentState = JSON.stringify({ sgr: currentSgrCodes, uri: currentUri });

          let runIdx;
          if (prevState !== currentState) {
            runIdx = localRunIndex++;
            prevState = currentState;

            // Register in sgrKeys/sgrCloseKeys pool if needed
            if (currentSgrCodes.length > 0) {
              const poolEntry = currentSgrCodes.map(code => `\x1b[${code}m`).join('\x00');
              let poolIdx = this.sgrKeys.indexOf(poolEntry);
              if (poolIdx === -1) {
                poolIdx = this.sgrKeys.length;
                this.sgrKeys.push(poolEntry);
                const closeCodes = getCloseCodes(currentSgrCodes);
                this.sgrCloseKeys.push(closeCodes.join('\x00'));
              }
            }

            // Store state for this run
            runToState.set(runIdx, { sgrCodes: currentSgrCodes, uriIdx: currentUri });
          } else {
            // Reuse previous run
            runIdx = localRunIndex - 1;
          }

          // Add grapheme to pool
          this.graphemes.push(grapheme);
          const width = graphemeWidth(grapheme);

          cells[cellCount * 2] = graphemeIndex;
          cells[cellCount * 2 + 1] = (runIdx << Ub) | (width & fC);

          if (grapheme === '\t') {
            cells[cellCount * 2 + 1] |= dC;
          }

          graphemeIndex++;
          cellCount++;
        }

        i = chunkEnd;
      }

      // Build runs array from tracked run states
      for (let runIdx = 0; runIdx < localRunIndex; runIdx++) {
        const state = runToState.get(runIdx) || { sgrCodes: [], uriIdx: 0 };
        let poolIdx = 0;
        if (state.sgrCodes.length > 0) {
          const poolEntry = state.sgrCodes.map(code => `\x1b[${code}m`).join('\x00');
          poolIdx = this.sgrKeys.indexOf(poolEntry);
          if (poolIdx === -1) poolIdx = 0;
        }
        runs[runIdx * 2] = poolIdx;
        runs[runIdx * 2 + 1] = state.uriIdx;
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
          // Fill tab stops with spaces (use this.screen.emptyCharIndex for space)
          const tabWidth = this.screen.tabWidth || 8;
          const nextTabStop = Math.min(((Math.floor(col / tabWidth) + 1) * tabWidth), destWidth);
          while (col < nextTabStop && col < destWidth) {
            const cellIdx = (y * destWidth + col) << 1;
            destCells[cellIdx] = this.screen.emptyCharIndex;
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
