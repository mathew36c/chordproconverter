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

// Create URL map
const samplerUrls = {};
SAMPLE_FILES.forEach(filename => {
  const noteFormat = filename.replace(/s(\d)/, '#$1');
  samplerUrls[noteFormat] = `${filename}.${SAMPLE_EXT}`;
});

console.log("Available samples:", Object.keys(samplerUrls).sort());

let sampler = null;
let samplerLoadPromise = null;
let isLoading = false;

// Loading indicator functions
function showLoadingIndicator() {
  const indicator = document.getElementById('audioLoadingIndicator');
  if (indicator) {
    indicator.classList.remove('hidden');
  }
}

function hideLoadingIndicator() {
  const indicator = document.getElementById('audioLoadingIndicator');
  if (indicator) {
    // Small delay for smooth transition
    setTimeout(() => {
      indicator.classList.add('hidden');
    }, 300);
  }
}

// Start loading samples immediately on page load
async function initializeSampler() {
  if (sampler || isLoading) return sampler;
  
  isLoading = true;
  showLoadingIndicator();
  
  try {
    console.log("Starting to load guitar samples...");
    
    // Initialize Tone.js context
    if (typeof Tone === 'undefined') {
      throw new Error("Tone.js is not loaded");
    }
    
    // Create the sampler
    const createdSampler = await new Promise((resolve, reject) => {
      const newSampler = new Tone.Sampler({
        urls: samplerUrls,
        baseUrl: SAMPLE_BASE_URL,
        release: 2,
        attack: 0.005,
        onload: () => {
          console.log("✓ Acoustic guitar samples loaded successfully");
          resolve(newSampler);
        },
        onerror: (error) => {
          console.error("✗ Sampler load error:", error);
          reject(error);
        }
      }).toDestination();
    });
    
    sampler = createdSampler;
    sampler.context.lookAhead = 0.05;
    isLoading = false;
    hideLoadingIndicator();
    
    return sampler;
  } catch (error) {
    isLoading = false;
    hideLoadingIndicator();
    console.error("Failed to initialize sampler:", error);
    throw error;
  }
}

// Ensure sampler is ready (for when user clicks)
async function ensureSampler() {
  if (sampler) {
    // Start audio context if needed
    if (Tone.context.state !== "running") {
      await Tone.start();
    }
    return sampler;
  }
  
  if (samplerLoadPromise) {
    return samplerLoadPromise;
  }
  
  // This shouldn't happen if initialization worked, but just in case
  samplerLoadPromise = initializeSampler();
  return samplerLoadPromise;
}

// Initialize Tone.js context on user interaction (required for audio playback)
let audioContextStarted = false;
async function startAudioContext() {
  if (audioContextStarted) return;
  
  try {
    await Tone.start();
    const ctx = Tone.getContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    audioContextStarted = true;
    console.log("Audio context started");
  } catch (error) {
    console.warn("Failed to start audio context:", error);
  }
}

// Simple chord parsing
function parseChordSymbol(symbol) {
  // Handle slash chords
  const [mainChord, bassNote] = symbol.split('/');
  
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

  // Minor chord adjustments
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

  // Parse the main chord
  const match = mainChord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return null;

  const [, root, suffix] = match;
  const isMinor = suffix.includes('m') && !suffix.includes('maj');
  
  // Normalize root
  let normalizedRoot = root;
  if (root.includes('b')) {
    const flatToSharp = {
      'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E',
      'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
    };
    normalizedRoot = flatToSharp[root] || root;
  }

  // Get chord notes
  let notes = isMinor ? minorMap[normalizedRoot] : noteMap[normalizedRoot];
  if (!notes) {
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

  // Parse bass note
  let bass = null;
  if (bassNote) {
    let normalizedBass = bassNote;
    if (bassNote.includes('b')) {
      const flatToSharp = {
        'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E',
        'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
      };
      normalizedBass = flatToSharp[bassNote] || bassNote;
    }
    bass = normalizedBass;
  }

  return { notes, bass };
}

// Check if a note is available
function isNoteAvailable(note) {
  return samplerUrls.hasOwnProperty(note);
}

// Find the closest available octave
function findAvailableOctave(pitchClass, preferredOctave) {
  let note = `${pitchClass}${preferredOctave}`;
  if (isNoteAvailable(note)) return note;
  
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
  // Use Tonal if available
  if (typeof Tonal !== 'undefined' && Tonal.Chord) {
    const [mainSymbol, slashBass] = symbol.split("/");
    const chord = Tonal.Chord.get(mainSymbol);
    
    if (!chord.empty) {
      const notes = chord.notes;
      const voicedNotes = [];

      notes.forEach((note, index) => {
        const pc = Tonal.Note.pitchClass(note);
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

      // Handle slash bass
      let bass = null;
      if (slashBass) {
        const bassPc = Tonal.Note.pitchClass(slashBass);
        let normalizedBass = bassPc;
        if (bassPc.includes('b')) {
          const flatToSharp = {
            'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E',
            'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
          };
          normalizedBass = flatToSharp[bassPc] || bassPc;
        }
        
        bass = findAvailableOctave(normalizedBass, 2) || 
               findAvailableOctave(normalizedBass, 3);
      }

      if (voicedNotes.length > 0) {
        return { notes: voicedNotes, bass };
      }
    }
  }

  // Fallback to simple parser
  const parsed = parseChordSymbol(symbol);
  
  if (!parsed) {
    console.warn(`Cannot parse chord: ${symbol}`);
    return null;
  }

  const voicedNotes = [];
  parsed.notes.forEach((pc, index) => {
    const targetOctave = index === 0 ? 3 : 4;
    const availableNote = findAvailableOctave(pc, targetOctave);
    if (availableNote && !voicedNotes.includes(availableNote)) {
      voicedNotes.push(availableNote);
    }
  });

  // Handle bass note
  let bass = null;
  if (parsed.bass) {
    bass = findAvailableOctave(parsed.bass, 2) || 
           findAvailableOctave(parsed.bass, 3);
  }

  if (voicedNotes.length === 0) {
    console.warn(`No playable notes for chord: ${symbol}`);
    return null;
  }

  console.log(`Chord "${symbol}": ${parsed.notes.join(", ")} -> ${voicedNotes.join(", ")}${bass ? ` + bass ${bass}` : ''}`);
  return { notes: voicedNotes, bass };
}

async function playChord(symbol) {
  try {
    // Start audio context on first interaction
    await startAudioContext();
    
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

    console.log(`Playing chord "${symbol}": [${parsed.notes.join(", ")}]${parsed.bass ? ` + bass ${parsed.bass}` : ''}`);

    const now = Tone.now();
    const strumGap = 0.025;

    // Play bass note first if present
    if (parsed.bass) {
      activeSampler.triggerAttackRelease(parsed.bass, "2n", now - 0.02, 0.85);
    }

    // Strum through the chord notes
    parsed.notes.forEach((note, index) => {
      const velocity = parsed.bass ? 0.6 : 0.7;
      activeSampler.triggerAttackRelease(note, "2n", now + index * strumGap, velocity);
    });
  } catch (error) {
    console.error("Error playing chord:", error);
  }
}

// Start loading samples immediately when page loads
document.addEventListener("DOMContentLoaded", () => {
  // Check if libraries are loaded
  if (typeof Tone === 'undefined') {
    console.error("Tone.js library not loaded");
    hideLoadingIndicator();
    return;
  }
  if (typeof Tonal === 'undefined') {
    console.warn("Tonal.js library not loaded - using fallback chord parser");
  }

  // Start loading samples immediately
  initializeSampler().catch(err => {
    console.error("Failed to load samples:", err);
  });

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