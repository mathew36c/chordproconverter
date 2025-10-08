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

let baseOutputText = "";
let outputText = "";
let transposeSteps = 0;
let useFlats = false;

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
  cleaned = cleaned.replace(/(\d)([A-Za-z])/g, "$1 $2").trim();

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

function getChordTokens(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

function extractChordPositions(chordLine) {
  const tokens = [];
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(chordLine)) !== null) {
    const token = match[0];
    if (isPureChord(token)) {
      tokens.push({ chord: token, position: match.index });
    }
  }
  return tokens;
}

function mergeChordsAndLyrics(chordLine, lyricLine) {
  const lyric = typeof lyricLine === "string" ? lyricLine : "";
  let processed = lyric;
  const chordPositions = extractChordPositions(chordLine);

  for (let i = chordPositions.length - 1; i >= 0; i--) {
    const { chord, position } = chordPositions[i];
    const insertPos = position <= processed.length ? position : processed.length;
    processed = `${processed.slice(0, insertPos)}[${chord}]${processed.slice(insertPos)}`;
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
      continue;
    }

    const chordTokens = getChordTokens(trimmedLine);
    const isChordLine =
      chordTokens.length > 0 &&
      chordTokens.every(isChordToken) &&
      chordTokens.some(isPureChord);

    if (isChordLine) {
      const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
      const nextTrimmed = nextLine.trim();
      const nextTokens = nextTrimmed.length ? getChordTokens(nextTrimmed) : [];
      const nextIsChordLine =
        nextTokens.length > 0 &&
        nextTokens.every(isChordToken) &&
        nextTokens.some(isPureChord);
      const nextIsSection = detectSection(nextLine);
      const nextIsEmpty = nextTrimmed === "";

      if (!nextLine || nextIsChordLine || nextIsSection || nextIsEmpty) {
        const tokens = chordTokens;
        const chordLineOutput = tokens.map((token) => `[${token}]`).join("").replace(/\s+$/g, "");
        pushLine(chordLineOutput);
      } else {
        const merged = mergeChordsAndLyrics(line, nextLine);
        pushLine(merged);
        i += 1;
      }
      continue;
    }

    pushLine(line.replace(/\s+$/g, ""));
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

updateTransposeUI();
updateFlatsUI();
updateOutput();