const inputField = document.getElementById("inputField");
const outputDisplay = document.getElementById("outputDisplay");
const plainOutput = document.getElementById("plainOutput");
const pasteButton = document.getElementById("pasteButton");
const clearButton = document.getElementById("clearButton");
const copyButton = document.getElementById("copyButton");
const copyStatus = document.getElementById("copyStatus");
const transposeDown = document.getElementById("transposeDown");
const transposeUp = document.getElementById("transposeUp");
const transposeValue = document.getElementById("transposeValue");
const flatsToggle = document.getElementById("flatsToggle");
const groupChordsToggle = document.getElementById("groupChordsToggle");

let baseOutputText = "";
let outputText = "";
let transposeSteps = 0;
let useFlats = false;
let groupChords = false;

const MIN_TRANSPOSE = -11;
const MAX_TRANSPOSE = 11;

const sectionMatchers = [
  { regex: /^verse\b/i, canonical: "Verse" },
  { regex: /^chorus\b/i, canonical: "Chorus" },
  { regex: /^pre[\s-]*chorus\b/i, canonical: "Pre-Chorus" },
  { regex: /^bridge\b/i, canonical: "Bridge" },
  { regex: /^intro\b/i, canonical: "Intro" },
  { regex: /^outro\b/i, canonical: "Outro" },
  { regex: /^instrumental\b/i, canonical: "Instrumental" },
  { regex: /^interlude\b/i, canonical: "Interlude" },
  { regex: /^solo\b/i, canonical: "Solo" },
  { regex: /^riff\b/i, canonical: "Riff" },
  { regex: /^adlib\b/i, canonical: "Adlib" },
  { regex: /^tag\b/i, canonical: "Tag" },
  { regex: /^refrain\b/i, canonical: "Refrain" },
  { regex: /^prelude\b/i, canonical: "Prelude" },
  { regex: /^ending\b/i, canonical: "Ending" },
  { regex: /^coda\b/i, canonical: "Coda" },
  { regex: /^to\s+chorus\b/i, canonical: "To Chorus" }
];

const chordRegex = /^(?:N\.?C\.?|[A-G](?:#|b)?(?:maj|min|dim|aug|sus|add|mmaj|madd|m|M|Δ)?(?:\d+)?(?:sus\d+)?(?:add\d+)?(?:[#b+\-](?:5|7|9|11|13))*(?:\/[A-G](?:#|b)?(?:\/[A-G](?:#|b)?)?)?(?:\([^\)]+\))?)$/i;
const connectorRegex = /^[-–—~]+$|^[:|]+$|^x\d+$/i;

const NOTE_INDEX = {
  C: 0, "B#": 0,
  "C#": 1, Db: 1,
  D: 2,
  "D#": 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, "E#": 5,
  "F#": 6, Gb: 6,
  G: 7,
  "G#": 8, Ab: 8,
  A: 9,
  "A#": 10, Bb: 10,
  B: 11, Cb: 11
};

const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function detectSection(line) {
  if (!line) return null;
  const trimmed = line.trim();
  if (!trimmed) return null;

  let cleaned = trimmed;
  if (/^\[[^\]]+\]$/.test(trimmed) || /^\([^\)]+\)$/.test(trimmed)) {
    cleaned = trimmed.slice(1, -1).trim();
  } else {
    cleaned = cleaned.replace(/^[\[\(]+/, "").replace(/[\]\)]+$/, "").trim();
  }

  cleaned = cleaned.replace(/\s*[:\-]+\s*$/, "");
  cleaned = cleaned.replace(/([A-Za-z])(\d)/g, "$1 $2");
  cleaned = cleaned.replace(/(\d)([A-Za-z])/g, (match, d, l) => (l.toLowerCase() === 'x' ? match : `${d} ${l}`)).trim();

  for (const matcher of sectionMatchers) {
    const match = cleaned.match(matcher.regex);
    if (match) {
      const suffix = cleaned.slice(match[0].length).trim();
      const finalName = suffix ? `${matcher.canonical} ${suffix}` : matcher.canonical;
      return finalName.replace(/\s+/g, " ").trim();
    }
  }

  return null;
}

function isPureChord(token) {
  return chordRegex.test(token);
}

function isChordToken(token) {
  return isPureChord(token) || connectorRegex.test(token);
}

function splitJammedChords(token) {
  // First, check if token contains spaces - if so, split by spaces and process each part
  if (token.includes(' ')) {
    const parts = token.split(/\s+/).filter(Boolean);
    const allResults = [];
    for (const part of parts) {
      allResults.push(...splitJammedChords(part));
    }
    // Only return split results if all parts were successfully parsed
    if (allResults.length > 0 && allResults.every(r => isChordToken(r))) {
      return allResults;
    }
    return [token]; // Return original if split didn't work
  }

  if (isChordToken(token)) return [token];

  const results = [];
  let remaining = token;
  let stuck = false;

  while (remaining.length > 0 && !stuck) {
    let bestMatch = null;
    let bestLen = 0;

    // 1. Try to find the longest valid chord prefix
    for (let i = 1; i <= Math.min(12, remaining.length); i++) {
      const sub = remaining.substring(0, i);
      if (isPureChord(sub)) {
        if (i > bestLen) { bestMatch = sub; bestLen = i; }
      }
    }

    if (bestMatch) {
      results.push(bestMatch);
      remaining = remaining.substring(bestLen);
    } else {
      // 2. If no chord match, check if it starts with a valid connector
      // We match against the connectorRegex parts: separators or repeat indicators (x3)
      // connectorRegex = /^[-–—~]+$|^[:|]+$|^x\d+$/i;
      // We look for a prefix that matches one of these.
      const connectorMatch = remaining.match(/^([-–—~]+|[:|]+|x\d+)/i);
      if (connectorMatch) {
        results.push(connectorMatch[0]);
        remaining = remaining.substring(connectorMatch[0].length);
      } else {
        stuck = true;
      }
    }
  }

  if (!stuck && remaining.length === 0) return results;
  return [token];
}

function getChordTokens(line) {
  const rawTokens = line.trim().split(/\s+/).filter(Boolean);
  const refinedTokens = [];

  for (const t of rawTokens) {
    refinedTokens.push(...splitJammedChords(t));
  }

  return refinedTokens;
}

function extractChordPositions(chordLine) {
  const tokens = [];
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(chordLine)) !== null) {
    const token = match[0];
    const startIndex = match.index;

    // 1. Try treating as single token first (performance + standard case)
    if (isChordToken(token)) {
      tokens.push({ chord: token, position: startIndex });
      continue;
    }

    // 2. Try splitting jammed chords
    // This handles cases like "Cm-F/A" where regex sees it as one token but it contains multiple
    const split = splitJammedChords(token);

    // If split returns just the original token, and it wasn't a chord token, then it's lyrics/noise.
    if (split.length === 1 && split[0] === token) {
      continue;
    }

    // 3. Map split tokens back to their positions within the token
    let searchStart = 0;
    for (const part of split) {
      // Find part staring from searchStart to ensure order
      const partIndex = token.indexOf(part, searchStart);
      if (partIndex !== -1) {
        tokens.push({ chord: part, position: startIndex + partIndex });
        searchStart = partIndex + part.length;
      }
    }
  }
  return tokens;
}

function mergeChordsAndLyrics(chordLine, lyricLine) {
  const lyric = typeof lyricLine === "string" ? lyricLine : "";
  const chordPositions = extractChordPositions(chordLine);

  // Separate chords into two groups:
  // 1. Chords within the lyric line length (insert normally)
  // 2. Chords beyond the lyric line length (append in order)
  const originalLyricLength = lyric.length;
  const chordsBeyond = chordPositions.filter(cp => cp.position >= originalLyricLength).sort((a, b) => a.position - b.position);
  const chordsWithin = chordPositions.filter(cp => cp.position < originalLyricLength);

  // Start by appending the chords that are beyond the original lyric length
  let processed = lyric;
  for (const { chord } of chordsBeyond) {
    processed += `[${chord}]`;
  }

  // Now insert the chords that are within the original lyric length (in reverse order)
  for (let i = chordsWithin.length - 1; i >= 0; i--) {
    const { chord, position } = chordsWithin[i];
    processed = `${processed.slice(0, position)}[${chord}]${processed.slice(position)}`;
  }

  return processed.replace(/\s+$/g, "");
}

function convertToChordPro(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const outputLines = [];
  let previousBlank = false;

  const pushLine = (line) => {
    if (line === "") {
      if (!previousBlank) {
        outputLines.push("");
        previousBlank = true;
      }
    } else {
      outputLines.push(line);
      previousBlank = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (trimmedLine === "") {
      pushLine("");
      continue;
    }

    const sectionName = detectSection(line);
    if (sectionName) {
      if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== "") {
        pushLine("");
      }
      pushLine(`{comment: ${sectionName}}`);
      // Skip blank lines immediately following a section header
      while (i + 1 < lines.length && lines[i + 1].trim() === "") {
        i++;
      }
      continue;
    }

    const chordTokens = getChordTokens(trimmedLine);
    const isChordLine =
      chordTokens.length > 0 &&
      chordTokens.every(isChordToken) &&
      chordTokens.some(isPureChord);

    if (isChordLine) {
      // Look ahead for the next content line, skipping blank lines
      let nextLineIndex = i + 1;
      while (nextLineIndex < lines.length && lines[nextLineIndex].trim() === "") {
        nextLineIndex++;
      }

      const nextLine = nextLineIndex < lines.length ? lines[nextLineIndex] : "";
      const nextTrimmed = nextLine.trim();
      const nextTokens = nextTrimmed.length ? getChordTokens(nextTrimmed) : [];

      const nextIsChordLine =
        nextTokens.length > 0 &&
        nextTokens.every(isChordToken) &&
        nextTokens.some(isPureChord);

      const nextIsSection = detectSection(nextLine);

      // It is a lyric line if it exists, is not a chord line, and is not a section header
      const isNextLyrics = nextLine && !nextIsChordLine && !nextIsSection;

      if (isNextLyrics) {
        const merged = mergeChordsAndLyrics(line, nextLine);
        // Clean up extra spaces (formatted nicely), handling tabs and NBSP
        const cleaned = merged.replace(/\s{2,}/g, " ").trim();
        pushLine(cleaned);

        // Skip over the lyric line we just consumed
        let currentSkipIndex = nextLineIndex;

        // Look ahead and skip subsequent blank lines to avoid "extra next lines"
        while (currentSkipIndex + 1 < lines.length && lines[currentSkipIndex + 1].trim() === "") {
          currentSkipIndex++;
        }

        i = currentSkipIndex;
      } else {
        // Standalone chord line (no lyrics following or followed by section/chords)
        const tokens = chordTokens;

        let chordLineOutput;
        if (groupChords) {
          // Group chords: [Am Bm C]
          chordLineOutput = `[${tokens.join(" ")}]`;
        } else {
          // Standard: [Am][Bm][C]
          chordLineOutput = tokens.map((token) => `[${token}]`).join("");
        }

        pushLine(chordLineOutput);

        // Consume subsequent blank lines for standalone chord lines too
        // This fixes the gap between multi-line chord progressions or between intro chords and Verse 1
        // We want to "eat" the blank lines so they don't become double line breaks in the output.
        // nextLineIndex already points to the first non-blank line (or end of file).
        // If nextLineIndex > i + 1, it means we skipped blank lines.

        // We update 'i' to point just before that next non-blank line so the next loop iteration picks it up.
        if (nextLineIndex > i + 1) {
          i = nextLineIndex - 1;
        }
      }
      continue;
    }

    // Regular lyric line (or text that wasn't matched as chords)

    // Check if it's a tab line (e.g. starts with "e|", "B|", "G|", "D|", "A|", "E|")
    if (/^[eBgDdAEx]\|/.test(trimmedLine) || trimmedLine.includes("-|-") || /^[-\d|/hpsbrv~]+$/.test(trimmedLine)) {
      // Preserve tab lines exactly as is (monospaced font will handle alignment)
      // Just trim the end to avoid trailing spaces
      pushLine(line.trimEnd());
      continue;
    }

    // Clean up extra spaces and trim leading/trailing whitespace for regular lyrics
    pushLine(line.replace(/\s{2,}/g, " ").trim());
  }

  while (outputLines.length && outputLines[0] === "") {
    outputLines.shift();
  }
  while (outputLines.length && outputLines[outputLines.length - 1] === "") {
    outputLines.pop();
  }

  return outputLines.join("\n");
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// (unchanged until highlightChordPro)
function escapeAttribute(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightChordPro(text) {
  if (!text) return "";
  let result = "";
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (char === "{") {
      const commentMatch = text.slice(i).match(/^\{comment:\s*[^}]*\}/i);
      if (commentMatch) {
        const matchText = commentMatch[0];
        const colonIndex = matchText.indexOf(":");
        const valueSegment = matchText.slice(colonIndex + 1, -1);
        const leadingSpaces = valueSegment.match(/^\s*/)[0];
        const trailingSpaces = valueSegment.match(/\s*$/)[0];
        const coreValue = valueSegment.slice(leadingSpaces.length, valueSegment.length - trailingSpaces.length);

        result += `<span class="brace">{</span><span class="comment-label">comment:</span>${escapeHtml(leadingSpaces)}<span class="comment-value">${escapeHtml(coreValue)}</span>${escapeHtml(trailingSpaces)}<span class="brace">}</span>`;
        i += matchText.length;
        continue;
      }
      result += `<span class="brace">{</span>`;
      i += 1;
      continue;
    }

    if (char === "}") {
      result += `<span class="brace">}</span>`;
      i += 1;
      continue;
    }

    if (char === "[") {
      const closingIndex = text.indexOf("]", i);
      if (closingIndex !== -1) {
        const inner = text.slice(i + 1, closingIndex);
        const chordData = escapeAttribute(inner.trim());
        result += `<span class="chord" data-chord="${chordData}"><span class="bracket">[</span><span class="chord-text">${escapeHtml(inner)}</span><span class="bracket">]</span></span>`;
        i = closingIndex + 1;
        continue;
      }
      result += `<span class="bracket">[</span>`;
      i += 1;
      continue;
    }

    if (char === "]") {
      result += `<span class="bracket">]</span>`;
      i += 1;
      continue;
    }

    if (char === "\n") {
      result += "\n";
      i += 1;
      continue;
    }

    result += escapeHtml(char);
    i += 1;
  }

  return result;
}

// rest of script.js unchanged

function mod(n, m) {
  return ((n % m) + m) % m;
}

function transposeNote(note, steps, preferFlat) {
  const normalized = note.replace(/[^A-G#b]/gi, "");
  if (!normalized) return note;
  const formatted = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const index = NOTE_INDEX[formatted];
  if (typeof index !== "number") {
    return note;
  }
  const newIndex = mod(index + steps, 12);
  let scale;
  if (preferFlat === true) {
    scale = FLAT_NOTES;
  } else if (preferFlat === false) {
    scale = SHARP_NOTES;
  } else if (formatted.includes("b") && !formatted.includes("#")) {
    scale = FLAT_NOTES;
  } else if (formatted.includes("#") && !formatted.includes("b")) {
    scale = SHARP_NOTES;
  } else {
    scale = SHARP_NOTES;
  }
  return scale[newIndex];
}

function transposeChordSymbol(symbol, steps, forceFlats) {
  if (steps === 0 && !forceFlats) return symbol;

  const parts = symbol.split("/");
  const result = parts.map((part) => {
    const leading = part.match(/^\s*/)?.[0] ?? "";
    const trailing = part.match(/\s*$/)?.[0] ?? "";
    const core = part.slice(leading.length, part.length - trailing.length);
    if (!core) return part;

    if (/^N\.?C\.?$/i.test(core)) {
      return part;
    }

    const match = core.match(/^([A-G](?:#|b)?)(.*)$/i);
    if (!match) {
      return part;
    }

    const root = match[1];
    const suffix = match[2];
    let preferFlatValue = null;
    if (forceFlats) {
      preferFlatValue = true;
    } else if (root.includes("b") && !root.includes("#")) {
      preferFlatValue = true;
    } else if (root.includes("#") && !root.includes("b")) {
      preferFlatValue = false;
    }

    const transposedRoot = transposeNote(root, steps, preferFlatValue);
    return `${leading}${transposedRoot}${suffix}${trailing}`;
  });

  return result.join("/");
}

function transposeBracketContent(inner, steps, forceFlats) {
  const leading = inner.match(/^\s*/)?.[0] ?? "";
  const trailing = inner.match(/\s*$/)?.[0] ?? "";
  const core = inner.slice(leading.length, inner.length - trailing.length);
  const trimmedCore = core.trim();
  if (!trimmedCore) return inner;

  // Handle multiple chords separated by spaces (e.g., "Am Bm C")
  // We split by space, transpose each token if it's a chord, then join back.
  const tokens = trimmedCore.split(/\s+/);
  if (tokens.length > 1) {
    const transposedTokens = tokens.map(token => {
      if (isPureChord(token)) {
        return transposeChordSymbol(token, steps, forceFlats);
      }
      return token;
    });
    return `${leading}${transposedTokens.join(" ")}${trailing}`;
  }

  // Single token logic
  if (!isPureChord(trimmedCore)) return inner;

  const transposed = transposeChordSymbol(trimmedCore, steps, forceFlats);
  return `${leading}${transposed}${trailing}`;
}

function applyTranspose(text, steps, forceFlats) {
  if (!text) return "";
  if (steps === 0 && !forceFlats) return text;

  return text.replace(/\[([^\]]+)\]/g, (match, inner) => {
    return `[${transposeBracketContent(inner, steps, forceFlats)}]`;
  });
}

function formatTransposeValue(steps) {
  return steps > 0 ? `+${steps}` : `${steps}`;
}

function updateTransposeUI() {
  transposeValue.textContent = formatTransposeValue(transposeSteps);
  transposeDown.disabled = transposeSteps <= MIN_TRANSPOSE;
  transposeUp.disabled = transposeSteps >= MAX_TRANSPOSE;
}

function updateFlatsUI() {
  flatsToggle.classList.toggle("active", useFlats);
  flatsToggle.setAttribute("aria-pressed", useFlats ? "true" : "false");
  if (useFlats) {
    flatsToggle.textContent = "Using flats";
  } else {
    flatsToggle.textContent = "Use flats";
  }
}

function updateGroupChordsUI() {
  if (!groupChordsToggle) return;
  groupChordsToggle.classList.toggle("active", groupChords);
  groupChordsToggle.setAttribute("aria-pressed", groupChords ? "true" : "false");
}

function updateTransposedOutput() {
  outputText = applyTranspose(baseOutputText, transposeSteps, useFlats);
  plainOutput.value = outputText;
  copyButton.disabled = outputText.trim().length === 0;
  outputDisplay.innerHTML = highlightChordPro(outputText || "");
}

function updateOutput() {
  baseOutputText = convertToChordPro(inputField.value || "");
  updateTransposedOutput();
}

async function handlePaste() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    inputField.focus();
    return;
  }

  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      inputField.value = text;
      transposeSteps = 0;
      updateTransposeUI();
      updateOutput();
    }
    inputField.focus();
  } catch (error) {
    inputField.focus();
    alert("Failed to paste from clipboard. Please paste manually using Ctrl+V or Cmd+V.");
  }
}

async function handleCopy() {
  if (!outputText) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(outputText);
    } else {
      plainOutput.value = outputText;
      plainOutput.select();
      document.execCommand("copy");
      plainOutput.blur();
    }
    copyStatus.textContent = "Copied!";
    setTimeout(() => {
      copyStatus.textContent = "";
    }, 1800);
  } catch (error) {
    alert("Failed to copy to clipboard.");
  }
}

inputField.addEventListener("input", () => {
  transposeSteps = 0;
  updateTransposeUI();
  updateOutput();
});

pasteButton.addEventListener("click", handlePaste);

clearButton.addEventListener("click", () => {
  inputField.value = "";
  transposeSteps = 0;
  updateTransposeUI();
  updateOutput();
});

copyButton.addEventListener("click", handleCopy);

transposeDown.addEventListener("click", () => {
  if (transposeSteps > MIN_TRANSPOSE) {
    transposeSteps -= 1;
    updateTransposeUI();
    updateTransposedOutput();
  }
});

transposeUp.addEventListener("click", () => {
  if (transposeSteps < MAX_TRANSPOSE) {
    transposeSteps += 1;
    updateTransposeUI();
    updateTransposedOutput();
  }
});

flatsToggle.addEventListener("click", () => {
  useFlats = !useFlats;
  updateFlatsUI();
  updateTransposedOutput();
});

if (groupChordsToggle) {
  groupChordsToggle.addEventListener("click", () => {
    groupChords = !groupChords;
    updateGroupChordsUI();
    updateOutput(); // Re-convert since grouping changes the base formatting
  });
}

updateTransposeUI();
updateFlatsUI();
updateGroupChordsUI();
updateOutput();