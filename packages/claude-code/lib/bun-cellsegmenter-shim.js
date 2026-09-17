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
        } else {
          // Incomplete SGR: treat \x1b as regular character (Bug 7 fix)
          i += 1;
          continue;
        }
      }

      // Check for OSC8 hyperlink: \x1b]8;;...
      if (str[i] === '\x1b' && str[i + 1] === ']' && str[i + 2] === '8' && str[i + 3] === ';') {
        // Find the end (BEL \x07 or ST \x1b\\)
        let j = i + 4;
        let endPos = -1;
        while (j < str.length) {
          if (str[j] === '\x07') {
            endPos = j;
            break;
          }
          if (str[j] === '\x1b' && str[j + 1] === '\\') {
            endPos = j + 1;
            break;
          }
          j++;
        }
        if (endPos >= 0) {
          const oscSeq = str.slice(i, endPos + 1);
          result += oscSeq;
          i = endPos + 1;
          continue;
        } else {
          // Incomplete OSC8: treat \x1b as regular character (Bug 7 fix)
          i += 1;
          continue;
        }
      }

      // Regular character: segment this chunk until next escape
      let chunkEnd = str.length;
      for (let j = i; j < str.length; j++) {
        if (str[j] === '\x1b') {
          chunkEnd = j;
          break;
        }
      }

      // Segment the chunk
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

      // Map: active style state + URI → local run index and URI
      const stateToLocalRun = new Map();
      const localRunToUri = new Map();  // Track URI for each local run

      // Track current active style attributes (e.g., "1", "31", "38;5;196")
      const activeAttributes = new Set();

      let i = 0;
      while (i < processedText.length) {
        // Check for SGR code: \x1b[...m
        if (processedText[i] === '\x1b' && processedText[i + 1] === '[') {
          let j = i + 2;
          while (j < processedText.length && processedText[j] !== 'm') {
            j++;
          }
          if (j < processedText.length && processedText[j] === 'm') {
            // Found complete SGR code
            const params = processedText.slice(i + 2, j);
            if (!params) {
              // Empty: \x1b[m means \x1b[0m (reset)
              activeAttributes.clear();
            } else {
              // Parse parameters, handling composites (38;5;n and 38;2;r;g;b)
              const parts = params.split(';');
              let k = 0;
              while (k < parts.length) {
                const p = parts[k];
                if (p === '0') {
                  activeAttributes.clear();
                } else if (p === '22') {
                  activeAttributes.delete('1');
                  activeAttributes.delete('2');
                } else if (p === '23') {
                  activeAttributes.delete('3');
                } else if (p === '24') {
                  activeAttributes.delete('4');
                } else if (p === '27') {
                  activeAttributes.delete('7');
                } else if (p === '28') {
                  activeAttributes.delete('8');
                } else if (p === '29') {
                  activeAttributes.delete('9');
                } else if (p === '39') {
                  // Foreground color reset
                  const keysToRemove = [];
                  for (const attr of activeAttributes) {
                    if (/^(30|31|32|33|34|35|36|37|90|91|92|93|94|95|96|97|38)/.test(attr)) {
                      keysToRemove.push(attr);
                    }
                  }
                  keysToRemove.forEach(k => activeAttributes.delete(k));
                } else if (p === '49') {
                  // Background color reset
                  const keysToRemove = [];
                  for (const attr of activeAttributes) {
                    if (/^(40|41|42|43|44|45|46|47|100|101|102|103|104|105|106|107|48)/.test(attr)) {
                      keysToRemove.push(attr);
                    }
                  }
                  keysToRemove.forEach(k => activeAttributes.delete(k));
                } else if (p === '38' || p === '48') {
                  // Composite: 38;5;n or 38;2;r;g;b (or 48 for background)
                  const colorType = parts[k + 1];
                  if (colorType === '5' && k + 2 < parts.length) {
                    const composite = `${p};5;${parts[k + 2]}`;
                    activeAttributes.add(composite);
                    k += 2;
                  } else if (colorType === '2' && k + 4 < parts.length) {
                    const composite = `${p};2;${parts[k + 2]};${parts[k + 3]};${parts[k + 4]}`;
                    activeAttributes.add(composite);
                    k += 4;
                  }
                } else if (p) {
                  // Single attribute
                  activeAttributes.add(p);
                }
                k++;
              }
            }
            i = j + 1;
            continue;
          } else {
            // Incomplete SGR: treat \x1b as regular character (Bug 7 fix)
            const chunkEnd = processedText.length;
            let foundEsc = false;
            for (let j = i + 1; j < processedText.length; j++) {
              if (processedText[j] === '\x1b') {
                foundEsc = true;
                i += 1;  // advance by 1 to process \x1b as-is
                break;
              }
            }
            if (!foundEsc) {
              // No more escapes, process as normal text
              i += 1;
            }
            continue;
          }
        }

        // Check for OSC8 hyperlink: \x1b]8;;...
        if (processedText[i] === '\x1b' && processedText[i + 1] === ']' && processedText[i + 2] === '8' && processedText[i + 3] === ';') {
          let j = i + 4;
          let endPos = -1;
          while (j < processedText.length) {
            if (processedText[j] === '\x07') {
              endPos = j;
              break;
            }
            if (processedText[j] === '\x1b' && processedText[j + 1] === '\\') {
              endPos = j + 1;
              break;
            }
            j++;
          }
          if (endPos >= 0) {
            // Parse OSC8 sequence
            const oscSeq = processedText.slice(i + 4, endPos);
            const semicolonPos = oscSeq.indexOf(';');
            if (semicolonPos >= 0) {
              const url = oscSeq.slice(semicolonPos + 1);
              if (url) {
                // URL present: open link
                let uriIdx = this.uris.indexOf(url);
                if (uriIdx === -1) {
                  uriIdx = this.uris.length;
                  this.uris.push(url);
                }
                currentUri = uriIdx + 1;  // +1 because 0 means no link
              } else {
                // Close sequence
                currentUri = 0;
              }
            }
            i = endPos + 1;
            continue;
          } else {
            // Incomplete OSC8: treat \x1b as regular character (Bug 7 fix)
            i += 1;
            continue;
          }
        }

        // Regular character: extract next grapheme chunk
        let chunkEnd = processedText.length;
        for (let j = i; j < processedText.length; j++) {
          if (processedText[j] === '\x1b') {
            chunkEnd = j;
            break;
          }
        }

        // Segment chunk into graphemes
        const chunk = processedText.slice(i, chunkEnd);
        const graphemeArray = Array.from(globalSegmenter.segment(chunk)).map(seg => seg.segment);

        for (const grapheme of graphemeArray) {
          // Determine run index for this grapheme
          // Include both SGR state and URI state in the key (Bug 8 fix)
          const sgrStateKey = Array.from(activeAttributes).sort().join('\x00');
          const stateKey = sgrStateKey + '|uri:' + currentUri;
          let runIdx = stateToLocalRun.get(stateKey);

          if (runIdx === undefined) {
            // First time seeing this state: allocate new local run
            runIdx = localRunIndex++;
            stateToLocalRun.set(stateKey, runIdx);
            localRunToUri.set(runIdx, currentUri);  // Track URI for this run

            // Register in pool if not already present (only for SGR part)
            if (sgrStateKey !== '') {
              const sgrCodeList = sgrStateKey.split('\x00').filter(s => s);
              const poolEntry = sgrCodeList.map(code => `\x1b[${code}m`).join('\x00');
              if (!this.sgrKeys.includes(poolEntry)) {
                this.sgrKeys.push(poolEntry);
                const closeCodes = sgrCodeList.map(() => '').join('\x00');
                this.sgrCloseKeys.push(closeCodes);
              }
            }
          }

          // Add grapheme to pool
          this.graphemes.push(grapheme);
          const width = stringWidth(grapheme, { ambiguousIsNarrow: this.ambiguousIsNarrow });

          // Build cell entry: graphemeIndex | runIndex<<10 | tabFlag | width
          cells[cellCount * 2] = graphemeIndex;
          cells[cellCount * 2 + 1] = (runIdx << Ub) | (width & fC);

          // Add tab marker if grapheme is a tab
          if (grapheme === '\t') {
            cells[cellCount * 2 + 1] |= dC;
          }

          graphemeIndex++;
          cellCount++;
        }

        i = chunkEnd;
      }

      // Build runs array: map local run indices to pool indices
      const maxLocalRunIdx = localRunIndex - 1;
      for (let localRun = 0; localRun <= maxLocalRunIdx; localRun++) {
        let poolIdx = 0;  // default

        // Find the state for this local run
        for (const [stateKey, localRunNum] of stateToLocalRun) {
          if (localRunNum === localRun) {
            if (stateKey !== '') {
              // Extract SGR part (before '|uri:')
              const pipePos = stateKey.indexOf('|uri:');
              const sgrPart = pipePos >= 0 ? stateKey.slice(0, pipePos) : stateKey;
              const sgrCodeList = sgrPart.split('\x00').filter(s => s);
              const poolEntry = sgrCodeList.map(code => `\x1b[${code}m`).join('\x00');
              poolIdx = this.sgrKeys.indexOf(poolEntry);
              if (poolIdx === -1) poolIdx = 0;
            }
            break;
          }
        }
        runs[localRun * 2] = poolIdx;
        // Get the URI value that was recorded for this run (Bug 8 fix)
        runs[localRun * 2 + 1] = localRunToUri.get(localRun) || 0;
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
