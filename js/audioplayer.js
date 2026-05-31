const INSTRUMENT_STORAGE_KEY = "chordInstrument";

const GUITAR_SAMPLE_FILES = [
  "A2", "As2", "A3", "As3", "A4", "As4",
  "B2", "B3", "B4",
  "C3", "C4", "C5", "Cs3", "Cs4", "Cs5",
  "D2", "D3", "D4", "D5", "Ds2", "Ds3", "Ds4",
  "E2", "E3", "E4",
  "F2", "F3", "F4", "Fs2", "Fs3", "Fs4",
  "G2", "G3", "G4", "Gs2", "Gs3", "Gs4"
];

const PIANO_SAMPLE_FILES = [
  "A2", "A3", "A4", "A5",
  "C2", "C3", "C4", "C5", "C6",
  "Ds2", "Ds3", "Ds4", "Ds5",
  "Fs2", "Fs3", "Fs4", "Fs5"
];

function buildSampleUrlMap(filenames) {
  const urls = {};
  filenames.forEach((filename) => {
    const note = filename.replace(/s(\d)/, "#$1");
    urls[note] = `${filename}.mp3`;
  });
  return urls;
}

const INSTRUMENTS = {
  guitar: {
    id: "guitar",
    label: "Acoustic",
    baseUrl: "./samples/guitar/",
    release: 2,
    attack: 0.005,
    strumGap: 0.025,
    buildUrls() {
      return buildSampleUrlMap(GUITAR_SAMPLE_FILES);
    },
    isNoteAvailable(note) {
      return buildSampleUrlMap(GUITAR_SAMPLE_FILES).hasOwnProperty(note);
    },
    findAvailableOctave(pitchClass, preferredOctave) {
      let note = `${pitchClass}${preferredOctave}`;
      if (this.isNoteAvailable(note)) return note;

      for (const offset of [1, -1, 2, -2]) {
        const octave = preferredOctave + offset;
        if (octave >= 2 && octave <= 5) {
          note = `${pitchClass}${octave}`;
          if (this.isNoteAvailable(note)) return note;
        }
      }
      return null;
    }
  },
  piano: {
    id: "piano",
    label: "Piano",
    baseUrl: "./samples/piano/",
    release: 1.8,
    attack: 0.001,
    strumGap: 0,
    buildUrls() {
      return buildSampleUrlMap(PIANO_SAMPLE_FILES);
    },
    isNoteAvailable() {
      return true;
    },
    findAvailableOctave(pitchClass, preferredOctave) {
      const octave = Math.max(2, Math.min(6, preferredOctave));
      return `${pitchClass}${octave}`;
    }
  }
};

let activeInstrumentId = localStorage.getItem(INSTRUMENT_STORAGE_KEY) || "guitar";
if (!INSTRUMENTS[activeInstrumentId]) activeInstrumentId = "guitar";

const samplers = { guitar: null, piano: null };
const samplerLoadPromises = {};
let isLoadingInstrument = null;

function getInstrumentConfig(id = activeInstrumentId) {
  return INSTRUMENTS[id];
}

function showLoadingIndicator(label = "Loading sounds...") {
  const indicator = document.getElementById("audioLoadingIndicator");
  const textEl = indicator?.querySelector(".loading-text");
  if (textEl) textEl.textContent = label;
  indicator?.classList.remove("hidden");
}

function hideLoadingIndicator() {
  const indicator = document.getElementById("audioLoadingIndicator");
  if (!indicator) return;
  setTimeout(() => indicator.classList.add("hidden"), 300);
}

async function initializeSampler(instrumentId) {
  if (samplers[instrumentId]) return samplers[instrumentId];
  if (samplerLoadPromises[instrumentId]) return samplerLoadPromises[instrumentId];

  const config = getInstrumentConfig(instrumentId);
  if (!config) return null;

  samplerLoadPromises[instrumentId] = (async () => {
    isLoadingInstrument = instrumentId;
    showLoadingIndicator(`Loading ${config.label.toLowerCase()} sounds...`);

    try {
      if (typeof Tone === "undefined") {
        throw new Error("Tone.js is not loaded");
      }

      const createdSampler = await new Promise((resolve, reject) => {
        const newSampler = new Tone.Sampler({
          urls: config.buildUrls(),
          baseUrl: config.baseUrl,
          release: config.release,
          attack: config.attack,
          onload: () => resolve(newSampler),
          onerror: (error) => reject(error)
        }).toDestination();
      });

      samplers[instrumentId] = createdSampler;
      createdSampler.context.lookAhead = 0.05;
      return createdSampler;
    } catch (error) {
      console.error(`Failed to initialize ${instrumentId} sampler:`, error);
      delete samplerLoadPromises[instrumentId];
      throw error;
    } finally {
      isLoadingInstrument = null;
      hideLoadingIndicator();
    }
  })();

  return samplerLoadPromises[instrumentId];
}

async function ensureSampler(instrumentId = activeInstrumentId) {
  if (typeof Tone !== "undefined" && Tone.context.state !== "running") {
    await Tone.start();
  }

  if (samplers[instrumentId]) return samplers[instrumentId];
  return initializeSampler(instrumentId);
}

async function setInstrument(instrumentId) {
  if (!INSTRUMENTS[instrumentId] || instrumentId === activeInstrumentId) {
    return activeInstrumentId;
  }

  activeInstrumentId = instrumentId;
  localStorage.setItem(INSTRUMENT_STORAGE_KEY, instrumentId);
  await ensureSampler(instrumentId);
  syncInstrumentRadios();
  return activeInstrumentId;
}

function getInstrument() {
  return activeInstrumentId;
}

function syncInstrumentRadios() {
  document.querySelectorAll('input[name="chordInstrument"]').forEach((input) => {
    input.checked = input.value === activeInstrumentId;
  });
}

let audioContextStarted = false;
async function startAudioContext() {
  if (typeof Tone === "undefined") return;

  try {
    await Tone.start();
    const ctx = Tone.getContext();
    if (ctx.state !== "running") {
      await ctx.resume();
    }
    audioContextStarted = true;
  } catch (error) {
    console.warn("Failed to start audio context:", error);
  }
}

function parseChordSymbol(symbol) {
  const [mainChord, bassNote] = symbol.split("/");

  const noteMap = {
    C: ["C", "E", "G"],
    "C#": ["C#", "F", "G#"],
    Db: ["C#", "F", "G#"],
    D: ["D", "F#", "A"],
    "D#": ["D#", "G", "A#"],
    Eb: ["D#", "G", "A#"],
    E: ["E", "G#", "B"],
    F: ["F", "A", "C"],
    "F#": ["F#", "A#", "C#"],
    Gb: ["F#", "A#", "C#"],
    G: ["G", "B", "D"],
    "G#": ["G#", "C", "D#"],
    Ab: ["G#", "C", "D#"],
    A: ["A", "C#", "E"],
    "A#": ["A#", "D", "F"],
    Bb: ["A#", "D", "F"],
    B: ["B", "D#", "F#"]
  };

  const minorMap = {
    C: ["C", "D#", "G"],
    "C#": ["C#", "E", "G#"],
    D: ["D", "F", "A"],
    "D#": ["D#", "F#", "A#"],
    E: ["E", "G", "B"],
    F: ["F", "G#", "C"],
    "F#": ["F#", "A", "C#"],
    G: ["G", "A#", "D"],
    "G#": ["G#", "B", "D#"],
    A: ["A", "C", "E"],
    "A#": ["A#", "C#", "F"],
    B: ["B", "D", "F#"]
  };

  const match = mainChord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return null;

  const [, root, suffix] = match;
  const isMinor = suffix.includes("m") && !suffix.includes("maj");

  let normalizedRoot = root;
  if (root.includes("b")) {
    const flatToSharp = {
      Cb: "B", Db: "C#", Eb: "D#", Fb: "E",
      Gb: "F#", Ab: "G#", Bb: "A#"
    };
    normalizedRoot = flatToSharp[root] || root;
  }

  let notes = isMinor ? minorMap[normalizedRoot] : noteMap[normalizedRoot];
  if (!notes) notes = noteMap[normalizedRoot] || ["C", "E", "G"];

  if (suffix.includes("7")) {
    const seventhMap = {
      C: "B", "C#": "C", D: "C#", "D#": "D",
      E: "D#", F: "E", "F#": "F", G: "F#",
      "G#": "G", A: "G#", "A#": "A", B: "A#"
    };
    const seventh = seventhMap[normalizedRoot];
    if (seventh && !notes.includes(seventh)) notes.push(seventh);
  }

  let bass = null;
  if (bassNote) {
    let normalizedBass = bassNote;
    if (bassNote.includes("b")) {
      const flatToSharp = {
        Cb: "B", Db: "C#", Eb: "D#", Fb: "E",
        Gb: "F#", Ab: "G#", Bb: "A#"
      };
      normalizedBass = flatToSharp[bassNote] || bassNote;
    }
    bass = normalizedBass;
  }

  return { notes, bass };
}

function findAvailableOctave(pitchClass, preferredOctave, instrumentId = activeInstrumentId) {
  return getInstrumentConfig(instrumentId).findAvailableOctave(pitchClass, preferredOctave);
}

function chordToNotes(symbol, instrumentId = activeInstrumentId) {
  const config = getInstrumentConfig(instrumentId);
  const rootOctave = instrumentId === "piano" ? 3 : 3;
  const upperOctave = instrumentId === "piano" ? 4 : 4;
  const bassOctaves = instrumentId === "piano" ? [2, 3] : [2, 3];

  if (typeof Tonal !== "undefined" && Tonal.Chord) {
    const [mainSymbol, slashBass] = symbol.split("/");
    const chord = Tonal.Chord.get(mainSymbol);

    if (!chord.empty) {
      const voicedNotes = [];

      chord.notes.forEach((note, index) => {
        const pc = Tonal.Note.pitchClass(note);
        let normalizedPc = pc;
        if (pc.includes("b")) {
          const flatToSharp = {
            Cb: "B", Db: "C#", Eb: "D#", Fb: "E",
            Gb: "F#", Ab: "G#", Bb: "A#"
          };
          normalizedPc = flatToSharp[pc] || pc;
        }

        const targetOctave = index === 0 ? rootOctave : upperOctave;
        const availableNote = config.findAvailableOctave(normalizedPc, targetOctave);
        if (availableNote && !voicedNotes.includes(availableNote)) {
          voicedNotes.push(availableNote);
        }
      });

      let bass = null;
      if (slashBass) {
        const bassPc = Tonal.Note.pitchClass(slashBass);
        let normalizedBass = bassPc;
        if (bassPc.includes("b")) {
          const flatToSharp = {
            Cb: "B", Db: "C#", Eb: "D#", Fb: "E",
            Gb: "F#", Ab: "G#", Bb: "A#"
          };
          normalizedBass = flatToSharp[bassPc] || bassPc;
        }

        for (const octave of bassOctaves) {
          bass = config.findAvailableOctave(normalizedBass, octave);
          if (bass) break;
        }
      }

      if (voicedNotes.length > 0) return { notes: voicedNotes, bass };
    }
  }

  const parsed = parseChordSymbol(symbol);
  if (!parsed) {
    console.warn(`Cannot parse chord: ${symbol}`);
    return null;
  }

  const voicedNotes = [];
  parsed.notes.forEach((pc, index) => {
    const targetOctave = index === 0 ? rootOctave : upperOctave;
    const availableNote = config.findAvailableOctave(pc, targetOctave);
    if (availableNote && !voicedNotes.includes(availableNote)) {
      voicedNotes.push(availableNote);
    }
  });

  let bass = null;
  if (parsed.bass) {
    for (const octave of bassOctaves) {
      bass = config.findAvailableOctave(parsed.bass, octave);
      if (bass) break;
    }
  }

  if (voicedNotes.length === 0) {
    console.warn(`No playable notes for chord: ${symbol}`);
    return null;
  }

  return { notes: voicedNotes, bass };
}

async function playVoicing(sampleNotes, bassNote = null, instrumentId = activeInstrumentId) {
  if (!sampleNotes || sampleNotes.length === 0) return;

  try {
    await startAudioContext();
    const activeSampler = await ensureSampler(instrumentId);
    if (!activeSampler) return;

    const config = getInstrumentConfig(instrumentId);
    const now = Tone.now();
    const sorted = [...sampleNotes].sort((a, b) => {
      return Tone.Frequency(a).toMidi() - Tone.Frequency(b).toMidi();
    });

    if (bassNote && sorted[0] !== bassNote) {
      activeSampler.triggerAttackRelease(
        bassNote,
        instrumentId === "piano" ? "1n" : "2n",
        now - 0.02,
        instrumentId === "piano" ? 0.8 : 0.85
      );
    }

    sorted.forEach((note, index) => {
      const velocity = instrumentId === "piano" ? 0.72 : bassNote ? 0.65 : 0.75;
      const time = now + index * config.strumGap;
      activeSampler.triggerAttackRelease(
        note,
        instrumentId === "piano" ? "1n" : "2n",
        time,
        velocity
      );
    });
  } catch (error) {
    console.error("Error playing voicing:", error);
  }
}

async function playChord(symbol, instrumentId = activeInstrumentId) {
  const parsed = chordToNotes(symbol, instrumentId);
  if (!parsed || parsed.notes.length === 0) {
    console.warn(`Cannot play chord: ${symbol}`);
    return;
  }
  await playVoicing(parsed.notes, parsed.bass, instrumentId);
}

const GUITAR_TUNING = ["E2", "A2", "D3", "G3", "B3", "E4"];

function positionToSampleNotes(position, instrumentId = activeInstrumentId) {
  const config = getInstrumentConfig(instrumentId);
  const { frets, baseFret = 1 } = position;
  const sampleNotes = [];

  frets.forEach((fret, stringIndex) => {
    if (fret < 0) return;

    const openNote = GUITAR_TUNING[stringIndex];
    let noteName;

    if (fret === 0) {
      noteName = openNote;
    } else {
      const absoluteFret = baseFret + fret - 1;
      if (typeof Tonal !== "undefined" && Tonal.Note) {
        noteName = Tonal.Note.transpose(openNote, Tonal.Interval.fromSemitones(absoluteFret));
      } else {
        return;
      }
    }

    const pc = noteName.replace(/\d+$/, "");
    const octave = parseInt(noteName.match(/\d+$/)?.[0] || "4", 10);
    const available = config.findAvailableOctave(pc, octave);
    if (available && !sampleNotes.includes(available)) {
      sampleNotes.push(available);
    }
  });

  return sampleNotes;
}

window.ChordAudio = {
  playChord,
  playVoicing,
  positionToSampleNotes,
  startAudioContext,
  setInstrument,
  getInstrument,
  syncInstrumentRadios,
  INSTRUMENTS
};

document.addEventListener("DOMContentLoaded", () => {
  if (typeof Tone === "undefined") {
    console.error("Tone.js library not loaded");
    hideLoadingIndicator();
    return;
  }
  if (typeof Tonal === "undefined") {
    console.warn("Tonal.js library not loaded - using fallback chord parser");
  }

  syncInstrumentRadios();
  initializeSampler("guitar").catch((err) => {
    console.error("Failed to load guitar samples:", err);
  });

  if (activeInstrumentId === "piano") {
    initializeSampler("piano").catch((err) => {
      console.error("Failed to load piano samples:", err);
    });
  }

  const outputEl = document.getElementById("outputDisplay");
  if (!outputEl) {
    console.warn("Output display element not found");
    return;
  }

  outputEl.addEventListener("click", async (event) => {
    if (event.target.closest("#chordShapePopover")) return;
    const chordEl = event.target.closest(".chord");
    if (!chordEl) return;

    const raw = chordEl.dataset.chord || chordEl.textContent.trim();
    const symbol = raw.trim().split(/\s+/)[0] || raw;

    await startAudioContext();

    if (window.ChordAudio.getInstrument?.() === "piano" && window.ChordShapes?.getPianoVoicingNotes) {
      const savedIndex = window.ChordShapes.getSavedShapeIndex(symbol);
      const notes = window.ChordShapes.getPianoVoicingNotes(symbol, savedIndex);
      if (notes.length) {
        await playVoicing(notes);
        return;
      }
    }

    if (window.ChordShapes?.getChordPositions) {
      const savedIndex = window.ChordShapes.getSavedShapeIndex(symbol);
      const { positions } = await window.ChordShapes.getChordPositions(symbol);
      if (positions.length && positions[savedIndex]) {
        const notes = positionToSampleNotes(positions[savedIndex]);
        if (notes.length) {
          await playVoicing(notes);
          return;
        }
      }
    }

    await playChord(symbol);
  });

  initChordTutorial(outputEl);
});

const TUTORIAL_STORAGE_KEY = "chordClickTutorialSeen";

function initChordTutorial(outputEl) {
  const tutorialEl = document.getElementById("chordTutorial");
  const dismissBtn = document.getElementById("chordTutorialDismiss");

  if (!outputEl || !tutorialEl || localStorage.getItem(TUTORIAL_STORAGE_KEY)) {
    return;
  }

  let targetChord = null;
  let dismissed = false;

  function dismissTutorial() {
    if (dismissed) return;
    dismissed = true;
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
    tutorialEl.classList.add("hidden");
    if (targetChord) {
      targetChord.classList.remove("chord-tutorial-target");
      targetChord = null;
    }
    observer.disconnect();
  }

  function positionTutorial() {
    if (!targetChord || tutorialEl.classList.contains("hidden")) return;

    const chordRect = targetChord.getBoundingClientRect();
    const tooltipRect = tutorialEl.getBoundingClientRect();
    const left = chordRect.left + chordRect.width / 2 - tooltipRect.width / 2;
    const top = chordRect.top - tooltipRect.height - 10;

    tutorialEl.style.left = `${Math.max(12, Math.min(left, window.innerWidth - tooltipRect.width - 12))}px`;
    tutorialEl.style.top = `${Math.max(12, top)}px`;
  }

  function updateTutorial() {
    if (dismissed) return;

    const firstChord = outputEl.querySelector(".chord");
    if (!firstChord) {
      tutorialEl.classList.add("hidden");
      if (targetChord) {
        targetChord.classList.remove("chord-tutorial-target");
        targetChord = null;
      }
      return;
    }

    if (targetChord !== firstChord) {
      if (targetChord) targetChord.classList.remove("chord-tutorial-target");
      targetChord = firstChord;
      targetChord.classList.add("chord-tutorial-target");
    }

    tutorialEl.classList.remove("hidden");
    requestAnimationFrame(positionTutorial);
  }

  const observer = new MutationObserver(updateTutorial);
  observer.observe(outputEl, { childList: true, subtree: true, characterData: true });

  dismissBtn?.addEventListener("click", dismissTutorial);

  outputEl.addEventListener("click", (event) => {
    if (event.target.closest(".chord")) dismissTutorial();
  });

  window.addEventListener("resize", positionTutorial);
  outputEl.addEventListener("scroll", positionTutorial);

  updateTutorial();
}
