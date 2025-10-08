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

  // Voice the notes: root at octave 3, others at octave 4
  const voicedNotes = notes.map((note, index) => {
    const pc = Tonal.Note.pitchClass(note);
    const enh = Tonal.Note.enharmonic(pc);
    const octave = index === 0 ? 3 : 4;
    return `${enh}${octave}`;
  });

  // Ensure we have at least 4 notes: if fewer than 4, add the root at octave 4 as an octave reinforcement/double
  if (voicedNotes.length < 4) {
    const rootPc = Tonal.Note.pitchClass(notes[0]);
    const rootEnh = Tonal.Note.enharmonic(rootPc);
    voicedNotes.push(`${rootEnh}4`);
  }

  // Log the parsed chord and notes
  console.log(`Parsed chord "${symbol}": original notes ${notes.join(", ")} -> voiced notes ${voicedNotes.join(", ")}`);

  // Handle bass if present
  const bass = slashBass
    ? `${Tonal.Note.enharmonic(Tonal.Note.pitchClass(slashBass))}2` // Bass at octave 2 for lower sound
    : chord.bass
    ? `${Tonal.Note.enharmonic(Tonal.Note.pitchClass(chord.bass))}2`
    : undefined;

  if (bass) {
    console.log(`Chord "${symbol}": bass note ${bass}`);
  }

  return { notes: voicedNotes, bass };
}

async function playChord(symbol) {
  const activeSampler = await ensureSampler().catch(() => null);
  if (!activeSampler) return;

  const parsed = chordToNotes(symbol);
  if (!parsed) return;

  // Log what we're about to play
  console.log(`Playing chord "${symbol}": notes [${parsed.notes.join(", ")}]${parsed.bass ? `, bass [${parsed.bass}]` : ""}`);

  const now = Tone.now();
  const strumGap = 0.03;

  parsed.notes.forEach((note, index) => {
    activeSampler.triggerAttackRelease(note, "2n", now + index * strumGap, 0.75);
  });

  if (parsed.bass) {
    activeSampler.triggerAttackRelease(parsed.bass, "2n", now - 0.02, 0.9);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const outputEl = document.getElementById("outputDisplay");
  if (!outputEl) return;

  outputEl.addEventListener("click", (event) => {
    const chordEl = event.target.closest(".chord");
    if (!chordEl) return;

    const chordSymbol = chordEl.dataset.chord || chordEl.textContent.trim();
    playChord(chordSymbol);
  });
});