const MIN_BPM = 40;
const MAX_BPM = 280;
const MIN_BEATS = 1;
const MAX_BEATS = 12;
const TAP_RESET_MS = 2000;
const TAP_MAX_HISTORY = 8;

class MetronomeEngine {
  constructor(tempo = 120) {
    this.audioContext = null;
    this.notesInQueue = [];
    this.pan = -1;
    this.currentBeatInBar = 0;
    this.beatsPerBar = 4;
    this.tempo = tempo;
    this.lookahead = 25;
    this.scheduleAheadTime = 0.01;
    this.nextNoteTime = 0.0;
    this.isRunning = false;
    this.intervalID = null;
  }

  setBeatsPerBar(beats) {
    this.beatsPerBar = beats;
  }

  setTempo(tempo) {
    this.tempo = tempo;
  }

  nextNote() {
    const secondsPerBeat = 60.0 / this.tempo;
    this.nextNoteTime += secondsPerBeat;

    this.currentBeatInBar++;
    if (this.currentBeatInBar >= this.beatsPerBar) {
      this.currentBeatInBar = 0;
    }
  }

  scheduleNote(beatNumber, time) {
    this.notesInQueue.push({ note: beatNumber, time });

    const osc = this.audioContext.createOscillator();
    const envelope = this.audioContext.createGain();
    const panNode = this.audioContext.createStereoPanner();
    panNode.pan.value = this.pan;

    osc.frequency.value = beatNumber % this.beatsPerBar === 0 ? 1400 : 800;
    envelope.gain.value = 3;
    envelope.gain.exponentialRampToValueAtTime(1, time + 0.001);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(envelope);
    envelope.connect(panNode);
    panNode.connect(this.audioContext.destination);

    osc.start(time);
    osc.stop(time + 0.03);
  }

  scheduler() {
    while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentBeatInBar, this.nextNoteTime);
      this.nextNote();
    }
  }

  async start() {
    if (this.isRunning) return true;

    if (this.audioContext == null) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    if (this.audioContext.state !== "running") {
      return false;
    }

    this.isRunning = true;
    this.currentBeatInBar = 0;
    this.nextNoteTime = this.audioContext.currentTime + 0.03;
    this.intervalID = setInterval(() => this.scheduler(), this.lookahead);
    return true;
  }

  stop() {
    this.isRunning = false;
    clearInterval(this.intervalID);
    this.intervalID = null;
    this.notesInQueue = [];
    this.currentBeatInBar = 0;
  }
}

const metronomeEngine = new MetronomeEngine();

function clampBpm(value) {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, value));
}

function bpmToDialAngle(nextBpm) {
  const travel = ((clampBpm(nextBpm) - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 360;
  return 180 + travel;
}

function pointerAngleFromTop(clientX, clientY, rect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}

function updateBpmDialUI(nextBpm) {
  const value = clampBpm(nextBpm);
  const display = document.getElementById("metronomeBpmDisplay");
  const arm = document.getElementById("metronomeDialArm");
  const dial = document.getElementById("metronomeDial");

  if (display) display.textContent = String(value);
  if (arm) arm.style.transform = `rotate(${bpmToDialAngle(value)}deg)`;
  if (dial) dial.setAttribute("aria-valuenow", String(value));
}

function initMetronomeDial() {
  const dial = document.getElementById("metronomeDial");
  if (!dial) return;

  let dragging = false;
  let lastTravel = ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 360;

  updateBpmDialUI(bpm);

  function setBpmFromPointer(clientX, clientY, useWrapGuard = false) {
    const rect = dial.getBoundingClientRect();
    const angle = pointerAngleFromTop(clientX, clientY, rect);
    let travel = (angle - 180 + 360) % 360;

    if (useWrapGuard) {
      const delta = travel - lastTravel;
      if (delta > 180) travel = lastTravel;
      else if (delta < -180) travel = lastTravel;
    }

    lastTravel = travel;
    const nextBpm = Math.round(MIN_BPM + (travel / 360) * (MAX_BPM - MIN_BPM));
    setMetronomeBpm(nextBpm);
  }

  dial.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    lastTravel = ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 360;
    dial.setPointerCapture(event.pointerId);
    dial.classList.add("is-dragging");
    setBpmFromPointer(event.clientX, event.clientY, false);
  });

  dial.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    event.preventDefault();
    setBpmFromPointer(event.clientX, event.clientY, true);
  });

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    dial.classList.remove("is-dragging");
    if (event.pointerId !== undefined) {
      try {
        dial.releasePointerCapture(event.pointerId);
      } catch (_) {
        /* ignore */
      }
    }
  }

  dial.addEventListener("pointerup", endDrag);
  dial.addEventListener("pointercancel", endDrag);

  dial.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      setMetronomeBpm(bpm + 1);
      lastTravel = ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 360;
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      setMetronomeBpm(bpm - 1);
      lastTravel = ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 360;
    }
  });
}

function initMetronomeTap() {
  const tapBtn = document.getElementById("metronomeTapBtn");
  if (!tapBtn) return;

  let tapTimestamps = [];
  let tapResetTimer = null;

  function resetTaps() {
    tapTimestamps = [];
    tapBtn.classList.remove("is-tapping");
    tapBtn.textContent = "Tap";
  }

  tapBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const now = performance.now();

    if (tapTimestamps.length && now - tapTimestamps[tapTimestamps.length - 1] > TAP_RESET_MS) {
      tapTimestamps = [];
    }

    tapTimestamps.push(now);
    if (tapTimestamps.length > TAP_MAX_HISTORY) {
      tapTimestamps.shift();
    }

    clearTimeout(tapResetTimer);
    tapResetTimer = setTimeout(resetTaps, TAP_RESET_MS);

    tapBtn.classList.add("is-tapping");

    if (tapTimestamps.length < 2) {
      tapBtn.textContent = "Tap again";
      return;
    }

    const intervals = [];
    for (let i = 1; i < tapTimestamps.length; i++) {
      intervals.push(tapTimestamps[i] - tapTimestamps[i - 1]);
    }

    const recent = intervals.slice(-3);
    const avgMs = recent.reduce((sum, ms) => sum + ms, 0) / recent.length;
    const tappedBpm = Math.round(60000 / avgMs);

    setMetronomeBpm(tappedBpm);
    tapBtn.textContent = "Tap";
  });
}

function clampBeats(value) {
  return Math.min(MAX_BEATS, Math.max(MIN_BEATS, value));
}

function updatePlayPauseUI(playing) {
  const playIcon = document.getElementById("metronomePlayIcon");
  const pauseIcon = document.getElementById("metronomePauseIcon");
  const playLabel = document.getElementById("metronomePlayLabel");
  const playPauseBtn = document.getElementById("metronomePlayPause");
  const metronomeButton = document.getElementById("metronomeButton");

  playIcon?.classList.toggle("hidden", playing);
  pauseIcon?.classList.toggle("hidden", !playing);
  if (playLabel) playLabel.textContent = playing ? "Pause" : "Start";
  if (playPauseBtn) {
    playPauseBtn.setAttribute("aria-label", playing ? "Pause metronome" : "Start metronome");
  }
  metronomeButton?.classList.toggle("is-playing", playing);
  metronomeButton?.setAttribute("aria-pressed", playing ? "true" : "false");
  metronomeButton?.setAttribute(
    "aria-label",
    playing ? "Pause metronome" : "Start metronome"
  );
}

function stopMetronome() {
  metronomeEngine.stop();
  updatePlayPauseUI(false);
}

async function startMetronome() {
  metronomeEngine.stop();
  metronomeEngine.setTempo(bpm);
  metronomeEngine.setBeatsPerBar(beatsPerMeasure);

  const started = await metronomeEngine.start();
  if (!started) return;
  updatePlayPauseUI(true);
}

async function toggleMetronomePlayback() {
  if (metronomeEngine.isRunning) {
    stopMetronome();
    return;
  }
  await startMetronome();
}

function setMetronomeBpm(nextBpm) {
  bpm = clampBpm(nextBpm);
  metronomeEngine.setTempo(bpm);
  updateBpmDialUI(bpm);
}

function setBeatsPerMeasure(nextBeats) {
  beatsPerMeasure = clampBeats(nextBeats);
  metronomeEngine.setBeatsPerBar(beatsPerMeasure);
  const valueEl = document.getElementById("metronomeBeatsValue");
  if (valueEl) valueEl.textContent = String(beatsPerMeasure);
}

async function restartMetronomeIfPlaying() {
  if (metronomeEngine.isRunning) {
    await startMetronome();
  }
}

let bpm = 120;
let beatsPerMeasure = 4;
metronomeEngine.setTempo(bpm);
metronomeEngine.setBeatsPerBar(beatsPerMeasure);

window.Metronome = {
  togglePlayback: toggleMetronomePlayback,
  setBpm: setMetronomeBpm,
  setBeatsPerMeasure: (value) => {
    setBeatsPerMeasure(value);
    restartMetronomeIfPlaying();
  },
  restartIfPlaying: restartMetronomeIfPlaying,
  initDial: initMetronomeDial
};

function initMetronomeControls() {
  initMetronomeDial();
  initMetronomeTap();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMetronomeControls);
} else {
  initMetronomeControls();
}
