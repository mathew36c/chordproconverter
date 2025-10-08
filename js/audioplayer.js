const SAMPLE_BASE_URL = "./samples/guitar/";
const SAMPLE_EXT = "mp3";
const SAMPLE_NOTES = [
  "E2","F2","F#2","G2","G#2","A2","A#2","B2",
  "C3","C#3","D3","D#3","E3","F3","F#3","G3","G#3","A3","A#3","B3",
  "C4","C#4","D4","D#4","E4","F4","F#4","G4","G#4","A4","A#4","B4",
  "C5","C#5","D5","D#5"
];

const samplerUrls = SAMPLE_NOTES.reduce((map, note) => {
  map[note] = `${note.replace("#", "s")}.${SAMPLE_EXT}`;
  return map;
}, {});

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

const OCTAVE_HINT = {
  C: 4, "C#": 4, Db: 4,
  D: 4, "D#": 4, Eb: 4,
  E: 3,
  F: 3, "F#": 3, Gb: 3,
  G: 3, "G#": 3, Ab: 3,
  A: 3, "A#": 3, Bb: 3,
  B: 3
};

function toGuitarNote(pc) {
  const norm = Tonal.Note.pitchClass(pc);
  const enh = Tonal.Note.enharmonic(norm);
  const octave = OCTAVE_HINT[enh] ?? 4;
  return `${enh}${octave}`;
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

  // Voice the notes with appropriate octaves for guitar
  const voicedNotes = notes.map((note, index) => {
    const pc = Tonal.Note.pitchClass(note);
    
    // Convert flats to sharps to match sample file naming
    let enh = pc;
    if (pc.includes('b')) {
      const natural = pc[0];
      const prevNote = String.fromCharCode(natural.charCodeAt(0) - 1);
      if (prevNote >= 'A') {
        enh = prevNote + '#';
      } else {
        enh = 'G#'; // Handle Cb -> B
      }
    }
    
    // Determine octave based on position and note
    let octave;
    if (index === 0) {
      // Root note - use lower octave
      octave = 3;
    } else {
      // Other notes - check if they would be in guitar range
      octave = 4;
      // Adjust if note would be too high
      if (['A', 'A#', 'B'].includes(enh) && octave === 4) {
        octave = 3;
      }
    }
    
    return `${enh}${octave}`;
  });

  // Ensure we have at least 3-4 notes for a fuller sound
  while (voicedNotes.length < 3) {
    const rootPc = Tonal.Note.pitchClass(notes[0]);
    let rootEnh = rootPc;
    if (rootPc.includes('b')) {
      const natural = rootPc[0];
      const prevNote = String.fromCharCode(natural.charCodeAt(0) - 1);
      if (prevNote >= 'A') {
        rootEnh = prevNote + '#';
      } else {
        rootEnh = 'G#';
      }
    }
    voicedNotes.push(`${rootEnh}4`);
  }

  // Filter out notes that aren't in our sample set
  const availableNotes = voicedNotes.filter(note => SAMPLE_NOTES.includes(note));
  
  if (availableNotes.length === 0) {
    console.warn(`No available samples for chord: ${symbol}`);
    return null;
  }

  console.log(`Parsed chord "${symbol}": ${notes.join(", ")} -> ${availableNotes.join(", ")}`);

  // Handle bass note if present
  let bass = null;
  if (slashBass) {
    const bassPc = Tonal.Note.pitchClass(slashBass);
    let bassEnh = bassPc;
    if (bassPc.includes('b')) {
      const natural = bassPc[0];
      const prevNote = String.fromCharCode(natural.charCodeAt(0) - 1);
      if (prevNote >= 'A') {
        bassEnh = prevNote + '#';
      } else {
        bassEnh = 'G#';
      }
    }
    bass = `${bassEnh}2`;
    
    // Check if bass note is in our sample range
    if (!SAMPLE_NOTES.includes(bass)) {
      // Try octave 3 if octave 2 isn't available
      bass = `${bassEnh}3`;
      if (!SAMPLE_NOTES.includes(bass)) {
        bass = null;
      }
    }
  }

  if (bass) {
    console.log(`Bass note for "${symbol}": ${bass}`);
  }

  return { notes: availableNotes, bass };
}

async function playChord(symbol) {
  try {
    const activeSampler = await ensureSampler();
    if (!activeSampler) {
      console.error("Sampler not available");
      return;
    }

    const parsed = chordToNotes(symbol);
    if (!parsed) return;

    console.log(`Playing chord "${symbol}": notes [${parsed.notes.join(", ")}]${parsed.bass ? `, bass [${parsed.bass}]` : ""}`);

    const now = Tone.now();
    const strumGap = 0.03;

    // Play bass note first if present
    if (parsed.bass) {
      activeSampler.triggerAttackRelease(parsed.bass, "2n", now - 0.02, 0.9);
    }

    // Strum through the chord notes
    parsed.notes.forEach((note, index) => {
      activeSampler.triggerAttackRelease(note, "2n", now + index * strumGap, 0.75);
    });
  } catch (error) {
    console.error("Error playing chord:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const outputEl = document.getElementById("outputDisplay");
  if (!outputEl) return;

  outputEl.addEventListener("click", async (event) => {
    const chordEl = event.target.closest(".chord");
    if (!chordEl) return;

    const chordSymbol = chordEl.dataset.chord || chordEl.textContent.trim();
    await playChord(chordSymbol);
  });
});