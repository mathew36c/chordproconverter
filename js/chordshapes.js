const CHORDS_DB_URL = "https://cdn.jsdelivr.net/gh/tombatossals/chords-db@master/lib/guitar.json";
const MAX_SHAPES = 5;
const SHOW_DELAY_MS = 350;
const HIDE_DELAY_MS = 250;

const DB_KEY_MAP = {
  C: "C",
  "C#": "Csharp",
  Db: "Csharp",
  D: "D",
  "D#": "Eb",
  Eb: "Eb",
  E: "E",
  F: "F",
  "F#": "Fsharp",
  Gb: "Fsharp",
  G: "G",
  "G#": "Ab",
  Ab: "Ab",
  A: "A",
  "A#": "Bb",
  Bb: "Bb",
  B: "B",
  Cb: "B"
};

const SUFFIX_ALIASES = {
  major: "major",
  M: "major",
  maj: "major",
  minor: "minor",
  m: "minor",
  min: "minor",
  dim: "dim",
  diminished: "dim",
  aug: "aug",
  augmented: "aug",
  "7": "7",
  dom7: "7",
  dominant: "7",
  maj7: "maj7",
  M7: "maj7",
  m7: "m7",
  min7: "m7",
  "m7b5": "m7b5",
  dim7: "dim7",
  sus2: "sus2",
  sus4: "sus4",
  "6": "6",
  "9": "9",
  add9: "add9",
  "11": "11",
  "13": "13",
  mmaj7: "mmaj7",
  aug7: "aug7",
  "7b5": "7b5",
  "7sus4": "7sus4"
};

let guitarDb = null;
let guitarDbPromise = null;
const shapeMemory = new Map();

function getShapeMemoryKey(symbol) {
  return primaryChordToken(symbol);
}

function getSavedShapeIndex(symbol) {
  const key = getShapeMemoryKey(symbol);
  return shapeMemory.has(key) ? shapeMemory.get(key) : 0;
}

function saveShapeIndex(symbol, index) {
  if (!symbol) return;
  shapeMemory.set(getShapeMemoryKey(symbol), index);
}

function loadGuitarDb() {
  if (guitarDb) return Promise.resolve(guitarDb);
  if (guitarDbPromise) return guitarDbPromise;

  guitarDbPromise = fetch(CHORDS_DB_URL)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to load chord shapes");
      return res.json();
    })
    .then((data) => {
      guitarDb = data;
      return data;
    })
    .catch((err) => {
      console.warn("Chord shape database unavailable:", err);
      guitarDbPromise = null;
      return null;
    });

  return guitarDbPromise;
}

function primaryChordToken(symbol) {
  const trimmed = symbol.trim();
  const parts = trimmed.split(/\s+/);
  for (const part of parts) {
    if (/^[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|Δ|\d|\/|#|b|\(|\))*$/i.test(part)) {
      return part;
    }
  }
  return parts[0] || trimmed;
}

function parseChordLookup(symbol) {
  const token = primaryChordToken(symbol);
  const [mainPart, slashBass] = token.split("/");

  if (typeof Tonal !== "undefined" && Tonal.Chord) {
    const chord = Tonal.Chord.get(mainPart);
    if (!chord.empty) {
      const tonic = chord.tonic || mainPart.match(/^[A-G][#b]?/)?.[0];
      const tonalType = (chord.type || "major").toLowerCase();
      const tonalSuffixMap = {
        major: "major",
        minor: "minor",
        diminished: "dim",
        augmented: "aug",
        "dominant seventh": "7",
        "major seventh": "maj7",
        "minor seventh": "m7",
        "half-diminished": "m7b5",
        "diminished seventh": "dim7",
        "suspended fourth": "sus4",
        "suspended second": "sus2",
        "minor major seventh": "mmaj7",
        "augmented seventh": "aug7",
        "dominant ninth": "9",
        "major ninth": "maj9",
        "minor ninth": "m9"
      };
      let suffix = tonalSuffixMap[tonalType];
      if (!suffix) {
        const alias = chord.aliases?.[0] || "";
        suffix = SUFFIX_ALIASES[alias] || SUFFIX_ALIASES[alias.replace("maj", "major")] || "major";
      }

      const normalizedSuffix = SUFFIX_ALIASES[suffix] || suffix;

      if (slashBass) {
        const bassPc = Tonal.Note.pitchClass(slashBass);
        const bassKey = bassPc.includes("#")
          ? bassPc
          : bassPc.includes("b")
            ? bassPc
            : bassPc;
        const slashSuffix = `/${bassKey}`;
        return { key: tonic, suffix: normalizedSuffix, slashSuffix, display: token };
      }

      return { key: tonic, suffix: normalizedSuffix, slashSuffix: null, display: token };
    }
  }

  const match = mainPart.match(/^([A-G][#b]?)(.*)$/i);
  if (!match) return null;

  const [, root, rest] = match;
  let suffix = "major";
  const r = rest.toLowerCase();
  if (!r || r === "maj") suffix = "major";
  else if (r === "m" || r.startsWith("min")) suffix = "minor";
  else if (r.startsWith("dim")) suffix = "dim";
  else if (r.startsWith("aug")) suffix = "aug";
  else if (r === "7") suffix = "7";
  else if (r.includes("maj7")) suffix = "maj7";
  else if (r.includes("m7")) suffix = "m7";
  else if (r.includes("sus2")) suffix = "sus2";
  else if (r.includes("sus4")) suffix = "sus4";
  else if (r.includes("add9")) suffix = "add9";
  else if (/\d/.test(r)) suffix = r.replace(/[^a-z0-9#b]/gi, "") || "7";

  return { key: root, suffix, slashSuffix: slashBass ? `/${slashBass}` : null, display: token };
}

async function getChordPositions(symbol) {
  const lookup = parseChordLookup(symbol);
  if (!lookup) return { lookup: null, positions: [] };

  const db = await loadGuitarDb();
  if (!db?.chords) return { lookup, positions: [] };

  const dbKey = DB_KEY_MAP[lookup.key];
  if (!dbKey || !db.chords[dbKey]) return { lookup, positions: [] };

  const entries = db.chords[dbKey];
  const trySuffixes = [lookup.suffix];
  if (lookup.slashSuffix) trySuffixes.unshift(lookup.slashSuffix);
  if (lookup.suffix !== "major" && lookup.suffix !== "minor") {
    trySuffixes.push("major", "minor");
  }

  for (const suffix of trySuffixes) {
    const entry = entries.find((c) => c.suffix === suffix);
    if (entry?.positions?.length) {
      return { lookup, positions: entry.positions.slice(0, MAX_SHAPES) };
    }
  }

  return { lookup, positions: [] };
}

const PIANO_WHITE_ORDER = ["C", "D", "E", "F", "G", "A", "B"];
const PIANO_BLACK_AFTER = {
  C: "C#",
  D: "D#",
  F: "F#",
  G: "G#",
  A: "A#"
};

function getPianoInversionCount(symbol) {
  const token = primaryChordToken(symbol).split("/")[0];
  if (typeof Tonal !== "undefined" && Tonal.Chord) {
    const chord = Tonal.Chord.get(token);
    if (!chord.empty && chord.notes.length) return chord.notes.length;
  }
  return 1;
}

function getPianoVoicingNotes(symbol, inversionIndex = 0) {
  const token = primaryChordToken(symbol);
  const [mainPart, slashBass] = token.split("/");

  if (typeof Tonal === "undefined" || !Tonal.Chord) return [];

  const chord = Tonal.Chord.get(mainPart);
  if (chord.empty || !chord.notes.length) return [];

  const rotated = [
    ...chord.notes.slice(inversionIndex % chord.notes.length),
    ...chord.notes.slice(0, inversionIndex % chord.notes.length)
  ];

  const voiced = [];
  let octave = 3;

  rotated.forEach((pitchClass, index) => {
    let noteName = `${Tonal.Note.pitchClass(pitchClass)}${octave}`;
    if (index > 0) {
      while (Tonal.Note.midi(noteName) <= Tonal.Note.midi(voiced[voiced.length - 1])) {
        octave += 1;
        noteName = `${Tonal.Note.pitchClass(pitchClass)}${octave}`;
      }
    }
    voiced.push(noteName);
  });

  if (slashBass) {
    const bassPc = Tonal.Note.pitchClass(slashBass);
    let bassNote = `${bassPc}2`;
    if (voiced.length && Tonal.Note.midi(bassNote) >= Tonal.Note.midi(voiced[0])) {
      bassNote = `${bassPc}1`;
    }
    if (!voiced.includes(bassNote)) {
      voiced.unshift(bassNote);
    }
  }

  return voiced;
}

function getPianoActiveMidis(symbol, inversionIndex = 0) {
  if (typeof Tonal === "undefined" || !Tonal.Note) return new Set();
  return new Set(
    getPianoVoicingNotes(symbol, inversionIndex)
      .map((note) => Tonal.Note.midi(note))
      .filter((midi) => Number.isFinite(midi))
  );
}

function buildPianoWhiteKeys(startOctave, endOctave) {
  const keys = [];
  for (let octave = startOctave; octave <= endOctave; octave++) {
    for (const name of PIANO_WHITE_ORDER) {
      keys.push(`${name}${octave}`);
      if (octave === endOctave && name !== "C") break;
    }
  }
  return keys;
}

function renderPianoDiagram(symbol, inversionIndex = 0) {
  const activeMidis = getPianoActiveMidis(symbol, inversionIndex);
  const isActive = (noteName) => {
    if (typeof Tonal === "undefined" || !Tonal.Note) return false;
    const midi = Tonal.Note.midi(noteName);
    return Number.isFinite(midi) && activeMidis.has(midi);
  };

  const startOctave = 3;
  const endOctave = 5;
  const whiteKeys = buildPianoWhiteKeys(startOctave, endOctave);
  const whiteKeyW = 15;
  const whiteKeyH = 54;
  const blackKeyW = 10;
  const blackKeyH = 34;
  const padX = 8;
  const padY = 8;
  const width = padX * 2 + whiteKeys.length * whiteKeyW;
  const height = padY * 2 + whiteKeyH + 14;

  let svg = `<svg class="chord-diagram-svg chord-piano-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Piano chord diagram">`;

  whiteKeys.forEach((noteName, index) => {
    const x = padX + index * whiteKeyW;
    const y = padY;
    const active = isActive(noteName);
    svg += `<rect x="${x}" y="${y}" width="${whiteKeyW - 1}" height="${whiteKeyH}" rx="1.5" class="chord-piano-white${active ? " is-active" : ""}"/>`;
    if (active && typeof Tonal !== "undefined") {
      svg += `<text x="${x + whiteKeyW / 2}" y="${y + whiteKeyH - 8}" text-anchor="middle" class="chord-piano-label">${Tonal.Note.pitchClass(noteName)}</text>`;
    }
  });

  whiteKeys.forEach((noteName, index) => {
    const match = noteName.match(/^([A-G])(\d+)$/);
    if (!match) return;

    const [, letter, octave] = match;
    const blackName = PIANO_BLACK_AFTER[letter];
    if (!blackName) return;

    const blackNote = `${blackName}${octave}`;
    const x = padX + index * whiteKeyW + whiteKeyW - blackKeyW / 2;
    const y = padY;
    const active = isActive(blackNote);
    svg += `<rect x="${x}" y="${y}" width="${blackKeyW}" height="${blackKeyH}" rx="1.5" class="chord-piano-black${active ? " is-active" : ""}"/>`;
    if (active) {
      svg += `<text x="${x + blackKeyW / 2}" y="${y + blackKeyH - 6}" text-anchor="middle" class="chord-piano-label chord-piano-label-dark">${blackName.replace("#", "♯")}</text>`;
    }
  });

  svg += "</svg>";
  return svg;
}

function renderChordDiagram(position) {
  const frets = position.frets;
  const fingers = position.fingers || [];
  const baseFret = position.baseFret || 1;
  const barres = Array.isArray(position.barres)
    ? position.barres
    : position.barres
      ? [position.barres]
      : [];

  const stringCount = 6;
  const fretCount = 4;
  const padX = 18;
  const padTop = 22;
  const padBottom = 10;
  const gridW = 88;
  const gridH = 72;
  const stringGap = gridW / (stringCount - 1);
  const fretGap = gridH / fretCount;
  const width = padX * 2 + gridW;
  const height = padTop + gridH + padBottom;

  const absoluteFrets = frets.map((f) => {
    if (f < 0) return -1;
    if (f === 0) return 0;
    return baseFret + f - 1;
  });

  const played = absoluteFrets.filter((f) => f > 0);
  const displayBase = played.length ? Math.min(...played) : baseFret;
  const showNut = displayBase <= 1;

  let svg = `<svg class="chord-diagram-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">`;

  if (!showNut) {
    svg += `<text x="${padX - 4}" y="${padTop + fretGap * 0.55}" class="chord-diagram-base-fret" text-anchor="end">${displayBase}</text>`;
  }

  for (let s = 0; s < stringCount; s++) {
    const x = padX + s * stringGap;
    svg += `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + gridH}" class="chord-diagram-string"/>`;
  }

  if (showNut) {
    svg += `<line x1="${padX}" y1="${padTop}" x2="${padX + gridW}" y2="${padTop}" class="chord-diagram-nut"/>`;
  }

  for (let f = 1; f <= fretCount; f++) {
    const y = padTop + f * fretGap;
    svg += `<line x1="${padX}" y1="${y}" x2="${padX + gridW}" y2="${y}" class="chord-diagram-fret"/>`;
  }

  barres.forEach((barreFret) => {
    const absBarre = baseFret + barreFret - 1;
    const rel = absBarre - displayBase + 1;
    if (rel < 1 || rel > fretCount) return;
    const y = padTop + (rel - 0.5) * fretGap;
    svg += `<line x1="${padX}" y1="${y}" x2="${padX + gridW}" y2="${y}" class="chord-diagram-barre"/>`;
  });

  frets.forEach((fret, s) => {
    const x = padX + s * stringGap;
    const finger = fingers[s] || 0;

    if (fret < 0) {
      svg += `<text x="${x}" y="${padTop - 6}" text-anchor="middle" class="chord-diagram-muted">×</text>`;
      return;
    }

    if (fret === 0) {
      svg += `<circle cx="${x}" cy="${padTop - 8}" r="4" class="chord-diagram-open"/>`;
      return;
    }

    const abs = baseFret + fret - 1;
    const rel = abs - displayBase + 1;
    const y = padTop + (rel - 0.5) * fretGap;

    svg += `<circle cx="${x}" cy="${y}" r="7" class="chord-diagram-dot"/>`;
    if (finger > 0) {
      svg += `<text x="${x}" y="${y + 4}" text-anchor="middle" class="chord-diagram-finger">${finger}</text>`;
    }
  });

  svg += "</svg>";
  return svg;
}

document.addEventListener("DOMContentLoaded", () => {
  const outputEl = document.getElementById("outputDisplay");
  const popover = document.getElementById("chordShapePopover");
  const titleEl = document.getElementById("chordShapeTitle");
  const diagramEl = document.getElementById("chordShapeDiagram");
  const counterEl = document.getElementById("chordShapeCounter");
  const prevBtn = document.getElementById("chordShapePrev");
  const nextBtn = document.getElementById("chordShapeNext");
  const playBtn = document.getElementById("chordShapePlay");
  const hintEl = document.getElementById("chordShapeHint");

  if (!outputEl || !popover) return;

  loadGuitarDb();

  let positions = [];
  let shapeIndex = 0;
  let currentSymbol = "";
  let anchorEl = null;
  let showTimer = null;
  let hideTimer = null;
  const isTouch = window.matchMedia("(hover: none)").matches;

  function clearTimers() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  }

  function positionPopover() {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - popRect.width / 2;
    let top = rect.top - popRect.height - 12;

    if (top < 12) top = rect.bottom + 12;
    left = Math.max(12, Math.min(left, window.innerWidth - popRect.width - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - popRect.height - 12));

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function isPianoInstrument() {
    return window.ChordAudio?.getInstrument?.() === "piano";
  }

  function updateShapeView() {
    const isPiano = isPianoInstrument();
    popover.classList.toggle("chord-shape-popover--piano", isPiano);

    if (isPiano) {
      const inversionCount = getPianoInversionCount(currentSymbol);
      shapeIndex = Math.max(0, Math.min(shapeIndex, inversionCount - 1));
      if (currentSymbol) saveShapeIndex(currentSymbol, shapeIndex);

      counterEl.textContent = `${shapeIndex + 1} of ${inversionCount}`;
      prevBtn.disabled = shapeIndex <= 0;
      nextBtn.disabled = shapeIndex >= inversionCount - 1;
      diagramEl.innerHTML = renderPianoDiagram(currentSymbol, shapeIndex);
      hintEl.classList.add("hidden");
      return;
    }

    const total = Math.max(positions.length, 1);
    shapeIndex = Math.max(0, Math.min(shapeIndex, total - 1));
    if (currentSymbol && positions.length) {
      saveShapeIndex(currentSymbol, shapeIndex);
    }
    counterEl.textContent = positions.length
      ? `${shapeIndex + 1} of ${positions.length}`
      : "1 of 1";

    prevBtn.disabled = shapeIndex <= 0;
    nextBtn.disabled = shapeIndex >= positions.length - 1;

    if (positions.length) {
      diagramEl.innerHTML = renderChordDiagram(positions[shapeIndex]);
      hintEl.classList.add("hidden");
    } else {
      diagramEl.innerHTML = `<p class="chord-diagram-fallback">Standard voicing</p>`;
      hintEl.classList.remove("hidden");
    }
  }

  async function openPopover(chordEl, symbol) {
    clearTimers();
    anchorEl = chordEl;
    currentSymbol = symbol;
    shapeIndex = getSavedShapeIndex(symbol);
    titleEl.textContent = primaryChordToken(symbol);

    popover.classList.remove("hidden");
    diagramEl.innerHTML = `<span class="chord-shape-loading">Loading…</span>`;
    positionPopover();

    const { positions: loaded } = await getChordPositions(symbol);
    positions = loaded;
    if (positions.length) {
      shapeIndex = Math.min(getSavedShapeIndex(symbol), positions.length - 1);
    } else {
      shapeIndex = 0;
    }
    updateShapeView();
    requestAnimationFrame(positionPopover);

    if (localStorage.getItem("chordClickTutorialSeen") !== "1") {
      document.getElementById("chordTutorialDismiss")?.click();
    }
  }

  function closePopover() {
    clearTimers();
    popover.classList.add("hidden");
    anchorEl = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(closePopover, HIDE_DELAY_MS);
  }

  function scheduleShow(chordEl) {
    clearTimers();
    const symbol = chordEl.dataset.chord || chordEl.textContent.trim();
    showTimer = setTimeout(() => openPopover(chordEl, symbol), SHOW_DELAY_MS);
  }

  outputEl.addEventListener("mouseover", (event) => {
    if (isTouch) return;
    const chordEl = event.target.closest(".chord");
    if (!chordEl) return;
    scheduleShow(chordEl);
  });

  outputEl.addEventListener("mouseout", (event) => {
    if (isTouch) return;
    const chordEl = event.target.closest(".chord");
    const toChord = event.relatedTarget?.closest?.(".chord");
    const toPopover = event.relatedTarget?.closest?.("#chordShapePopover");
    if (chordEl && !toChord && !toPopover) {
      clearTimeout(showTimer);
      scheduleHide();
    }
  });

  popover.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  popover.addEventListener("mouseleave", () => {
    if (!isTouch) scheduleHide();
  });

  document.addEventListener("click", (event) => {
    if (
      !popover.classList.contains("hidden") &&
      !event.target.closest("#chordShapePopover") &&
      !event.target.closest(".chord")
    ) {
      closePopover();
    }
  });

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (shapeIndex > 0) {
      shapeIndex -= 1;
      updateShapeView();
    }
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (shapeIndex < positions.length - 1) {
      shapeIndex += 1;
      updateShapeView();
    }
  });

  playBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!window.ChordAudio) return;

    await window.ChordAudio.startAudioContext();

    if (isPianoInstrument()) {
      const notes = getPianoVoicingNotes(currentSymbol, shapeIndex);
      if (notes.length) {
        await window.ChordAudio.playVoicing(notes);
        return;
      }
    }

    if (positions.length && positions[shapeIndex]) {
      const notes = window.ChordAudio.positionToSampleNotes(positions[shapeIndex]);
      if (notes.length) {
        await window.ChordAudio.playVoicing(notes);
        return;
      }
    }

    await window.ChordAudio.playChord(primaryChordToken(currentSymbol));
  });

  popover.querySelectorAll('input[name="chordInstrument"]').forEach((input) => {
    input.addEventListener("change", async (event) => {
      event.stopPropagation();
      if (!input.checked || !window.ChordAudio?.setInstrument) return;
      await window.ChordAudio.setInstrument(input.value);
      if (!popover.classList.contains("hidden")) {
        updateShapeView();
        requestAnimationFrame(positionPopover);
      }
    });
  });

  window.ChordAudio?.syncInstrumentRadios?.();

  window.addEventListener("resize", () => {
    if (!popover.classList.contains("hidden")) positionPopover();
  });

  outputEl.addEventListener("scroll", () => {
    if (!popover.classList.contains("hidden")) positionPopover();
  });
});

window.ChordShapes = {
  getSavedShapeIndex,
  saveShapeIndex,
  getChordPositions,
  primaryChordToken,
  getPianoVoicingNotes
};
