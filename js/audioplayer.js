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
      if (typeof Tone !== 'undefined') {
        Tone.start().catch((error) => {
          console.warn("Tone.start() failed:", error);
        });
      }
    },
    { once: true, passive: true }
  );
});

// Simple chord parsing without Tonal.js dependency
function parseChordSymbol(symbol) {
  // Basic chord root notes mapping
  const noteMap = {
    'C': ['C', 'E', 'G'],
    'C#': ['C#', 'F', 'G#'],
    'Db': ['C#', 'F', 'G#'],
    'D': ['D', 'F#', 'A'],
    'D#': ['D#', 'G', 'A#'],
    'Eb': ['D#', 'G', 'A#'],
    'E': ['E', 'G#', 'B'],
    'F': ['F', 'A', 'C'],
    'F#': ['F#', 'A#', 'C#'],
    'Gb': ['F#', 'A#', 'C#'],
    'G': ['G', 'B', 'D'],
    'G#': ['G#', 'C', 'D#'],
    'Ab': ['G#', 'C', 'D#'],
    'A': ['A', 'C#', 'E'],
    'A#': ['A#', 'D', 'F'],
    'Bb': ['A#', 'D', 'F'],
    'B': ['B', 'D#', 'F#']
  };

  // Minor chord adjustments (flatten the third)
  const minorMap = {
    'C': ['C', 'D#', 'G'],
    'C#': ['C#', 'E', 'G#'],
    'D': ['D', 'F', 'A'],
    'D#': ['D#', 'F#', 'A#'],
    'E': ['E', 'G', 'B'],
    'F': ['F', 'G#', 'C'],
    'F#': ['F#', 'A', 'C#'],
    'G': ['G', 'A#', 'D'],
    'G#': ['G#', 'B', 'D#'],
    'A': ['A', 'C', 'E'],
    'A#': ['A#', 'C#', 'F'],
    'B': ['B', 'D', 'F#']
  };

  // Parse the chord symbol
  const match = symbol.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return null;

  const [, root, suffix] = match;
  const isMinor = suffix.includes('m') && !suffix.includes('maj');
  
  // Normalize root (convert flats to sharps)
  let normalizedRoot = root;
  if (root.includes('b')) {
    const flatToSharp = {
      'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E',
      'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
    };
    normalizedRoot = flatToSharp[root] || root;
  }

  // Get basic triad
  let notes = isMinor ? minorMap[normalizedRoot] : noteMap[normalizedRoot];
  if (!notes) {
    // Fallback to major if not found
    notes = noteMap[normalizedRoot] || ['C', 'E', 'G'];
  }

  // Handle 7th chords
  if (suffix.includes('7')) {
    const seventhMap = {
      'C': 'B', 'C#': 'C', 'D': 'C#', 'D#': 'D',
      'E': 'D#', 'F': 'E', 'F#': 'F', 'G': 'F#',
      'G#': 'G', 'A': 'G#', 'A#': 'A', 'B': 'A#'
    };
    const seventh = seventhMap[normalizedRoot];
    if (seventh && !notes.includes(seventh)) {
      notes.push(seventh);
    }
  }

  return notes;
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
  // Use Tonal if available, otherwise use simple parser
  if (typeof Tonal !== 'undefined' && Tonal.Chord) {
    const [mainSymbol, slashBass] = symbol.split("/");
    const chord = Tonal.Chord.get(mainSymbol);
    
    if (!chord.empty) {
      const notes = chord.notes;
      const voicedNotes = [];

      notes.forEach((note, index) => {
        const pc = Tonal.Note.pitchClass(note);
        // Convert flats to sharps for our samples
        let normalizedPc = pc;
        if (pc.includes('b')) {
          const flatToSharp = {
            'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E',
            'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
          };
          normalizedPc = flatToSharp[pc] || pc;
        }
        
        const targetOctave = index === 0 ? 3 : 4;
        const availableNote = findAvailableOctave(normalizedPc, targetOctave);
        if (availableNote && !voicedNotes.includes(availableNote)) {
          voicedNotes.push(availableNote);
        }
      });

      if (voicedNotes.length > 0) {
        return { notes: voicedNotes, bass: null };
      }
    }
  }

  // Fallback to simple parser
  const [mainSymbol] = symbol.split("/");
  const notes = parseChordSymbol(mainSymbol);
  
  if (!notes) {
    console.warn(`Cannot parse chord: ${symbol}`);
    return null;
  }

  const voicedNotes = [];
  notes.forEach((pc, index) => {
    const targetOctave = index === 0 ? 3 : 4;
    const availableNote = findAvailableOctave(pc, targetOctave);
    if (availableNote && !voicedNotes.includes(availableNote)) {
      voicedNotes.push(availableNote);
    }
  });

  if (voicedNotes.length === 0) {
    console.warn(`No playable notes for chord: ${symbol}`);
    return null;
  }

  console.log(`Chord "${symbol}": ${notes.join(", ")} -> ${voicedNotes.join(", ")}`);
  return { notes: voicedNotes, bass: null };
}

async function playChord(symbol) {
  try {
    // Check if Tone.js is loaded
    if (typeof Tone === 'undefined') {
      console.error("Tone.js is not loaded");
      return;
    }

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

    console.log(`Playing chord "${symbol}": [${parsed.notes.join(", ")}]`);

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

// Wait for DOM and libraries to load
document.addEventListener("DOMContentLoaded", () => {
  // Check if libraries are loaded
  if (typeof Tone === 'undefined') {
    console.error("Tone.js library not loaded");
  }
  if (typeof Tonal === 'undefined') {
    console.warn("Tonal.js library not loaded - using fallback chord parser");
  }

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