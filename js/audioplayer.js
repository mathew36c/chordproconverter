const SAMPLE_BASE_URL = "./samples/guitar/";
const SAMPLE_EXT = "mp3";

// Your actual available samples
const SAMPLE_FILES = [
  "A2", "As2", "A3", "As3", "A4", "As4",
  "B2", "B3", "B4",
  "C3", "C4", "C5", "Cs3", "Cs4", "Cs5",
  "D2", "D3", "D4", "D5", "Ds2", "Ds3", "Ds4",
  "E2", "E3", "E4",
  "F2", "F3", "F4", "Fs2", "Fs3", "Fs4",
  "G2", "G3", "G4", "Gs2", "Gs3", "Gs4"
];

// Create URL map - map from note format (C#4) to file format (Cs4)
const samplerUrls = {};
SAMPLE_FILES.forEach(filename => {
  // Convert filename format to note format for Tone.js
  // As2 -> A#2, Cs3 -> C#3, etc.
  const noteFormat = filename.replace(/s(\d)/, '#$1');
  samplerUrls[noteFormat] = `${filename}.${SAMPLE_EXT}`;
});

console.log("Available samples:", Object.keys(samplerUrls).sort());

let sampler = null;
let samplerPromise = null;

async function ensureSampler() {
  if (sampler) return sampler;

  if (!samplerPromise) {
    samplerPromise = (async () => {
      await Tone.start();
      const ctx = Tone.getContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      return await new Promise((resolve, reject) => {
        const createdSampler = new Tone.Sampler({
          urls: samplerUrls,
          baseUrl: SAMPLE_BASE_URL,
          release: 2,
          attack: 0.005,
          onload: () => {
            sampler = createdSampler;
            sampler.context.lookAhead = 0.05;
            console.log("Acoustic guitar samples loaded");
            resolve(createdSampler);
          },
          onerror: (error) => {
            console.error("Sampler load error:", error);
            reject(error);
          }
        }).toDestination();
      });
    })().catch((error) => {
      samplerPromise = null;
      console.error("Failed to initialize sampler:", error);
      throw error;
    });
  }

  return samplerPromise;
}

// Initialize Tone.js on user interaction
["pointerdown", "touchstart", "keydown"].forEach((eventType) => {
  window.addEventListener(
    eventType,
    () => {
      Tone.start().catch((error) => {
        console.warn("Tone.start() failed:", error);
      });
    },
    { once: true, passive: true }
  );
});

// Convert a note to match our available samples
function normalizeNote(note) {
  // Get pitch class and octave
  const match = note.match(/^([A-G])([#b]?)(\d+)$/);
  if (!match) return null;
  
  let [, letter, accidental, octave] = match;
  
  // Convert flats to sharps
  if (accidental === 'b') {
    const flatToSharp = {
      'Cb': { note: 'B', octave: -1 },
      'Db': { note: 'C#', octave: 0 },
      'Eb': { note: 'D#', octave: 0 },
      'Fb': { note: 'E', octave: -1 },
      'Gb': { note: 'F#', octave: 0 },
      'Ab': { note: 'G#', octave: 0 },
      'Bb': { note: 'A#', octave: 0 }
    };
    
    const conversion = flatToSharp[letter + 'b'];
    if (conversion) {
      const adjustedOctave = parseInt(octave) + conversion.octave;
      return `${conversion.note}${adjustedOctave}`;
    }
  }
  
  return `${letter}${accidental}${octave}`;
}

// Check if a note is available in our samples
function isNoteAvailable(note) {
  return samplerUrls.hasOwnProperty(note);
}

// Find the closest available octave for a note
function findAvailableOctave(pitchClass, preferredOctave) {
  // Try the preferred octave first
  let note = `${pitchClass}${preferredOctave}`;
  if (isNoteAvailable(note)) return note;
  
  // Try adjacent octaves
  for (let offset of [1, -1, 2, -2]) {
    const octave = preferredOctave + offset;
    if (octave >= 2 && octave <= 5) {
      note = `${pitchClass}${octave}`;
      if (isNoteAvailable(note)) return note;
    }
  }
  
  return null;
}

function chordToNotes(symbol) {
  const [mainSymbol, slashBass] = symbol.split("/");
  const chord = Tonal.Chord.get(mainSymbol);
  
  if (chord.empty) {
    console.warn(`Unknown chord: ${symbol}`);
    return null;
  }

  // Get the notes from the chord
  const notes = chord.notes;
  const voicedNotes = [];

  notes.forEach((note, index) => {
    const pc = Tonal.Note.pitchClass(note);
    const normalized = normalizeNote(`${pc}3`); // Start with octave 3
    if (!normalized) return;
    
    const notePitchClass = normalized.slice(0, -1);
    
    // Determine octave based on position and note
    let targetOctave;
    if (index === 0) {
      // Root note - usually lower
      targetOctave = 3;
    } else {
      // Other notes - distribute across octaves
      if (['F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].includes(notePitchClass.replace('#', ''))) {
        targetOctave = 3;
      } else {
        targetOctave = 4;
      }
    }
    
    const availableNote = findAvailableOctave(notePitchClass, targetOctave);
    if (availableNote && !voicedNotes.includes(availableNote)) {
      voicedNotes.push(availableNote);
    }
  });

  // Add octave doubling if we have too few notes
  if (voicedNotes.length < 3 && notes.length > 0) {
    const rootPc = Tonal.Note.pitchClass(notes[0]);
    const normalized = normalizeNote(`${rootPc}4`);
    if (normalized) {
      const notePitchClass = normalized.slice(0, -1);
      const rootHigher = findAvailableOctave(notePitchClass, 4);
      if (rootHigher && !voicedNotes.includes(rootHigher)) {
        voicedNotes.push(rootHigher);
      }
    }
  }

  if (voicedNotes.length === 0) {
    console.warn(`No playable notes for chord: ${symbol}`);
    return null;
  }

  console.log(`Chord "${symbol}": ${notes.join(", ")} -> ${voicedNotes.join(", ")}`);

  // Handle bass note
  let bass = null;
  if (slashBass) {
    const bassPc = Tonal.Note.pitchClass(slashBass);
    const normalizedBass = normalizeNote(`${bassPc}2`);
    if (normalizedBass) {
      const bassPitchClass = normalizedBass.slice(0, -1);
      bass = findAvailableOctave(bassPitchClass, 2) || findAvailableOctave(bassPitchClass, 3);
    }
  }

  return { notes: voicedNotes, bass };
}

async function playChord(symbol) {
  try {
    const activeSampler = await ensureSampler();
    if (!activeSampler) {
      console.error("Sampler not available");
      return;
    }

    const parsed = chordToNotes(symbol);
    if (!parsed || parsed.notes.length === 0) {
      console.warn(`Cannot play chord: ${symbol}`);
      return;
    }

    console.log(`Playing chord "${symbol}": [${parsed.notes.join(", ")}]${parsed.bass ? ` + bass ${parsed.bass}` : ""}`);

    const now = Tone.now();
    const strumGap = 0.025; // Guitar strum timing

    // Play bass note first if present
    if (parsed.bass) {
      activeSampler.triggerAttackRelease(parsed.bass, "2n", now - 0.01, 0.9);
    }

    // Strum through the chord notes
    parsed.notes.forEach((note, index) => {
      activeSampler.triggerAttackRelease(note, "2n", now + index * strumGap, 0.7);
    });
  } catch (error) {
    console.error("Error playing chord:", error);
  }
}

// Wait for DOM and attach event listener
document.addEventListener("DOMContentLoaded", () => {
  const outputEl = document.getElementById("outputDisplay");
  if (!outputEl) {
    console.warn("Output display element not found");
    return;
  }

  outputEl.addEventListener("click", async (event) => {
    const chordEl = event.target.closest(".chord");
    if (!chordEl) return;

    const chordSymbol = chordEl.dataset.chord || chordEl.textContent.trim();
    console.log(`Clicked chord: ${chordSymbol}`);
    await playChord(chordSymbol);
  });
});