import type { DetectedNote, Evidence, Exercise } from "./types";
import { inputConstraints, inputError, loadInput } from "./input";

const midiOf = (frequency: number) => 69 + 12 * Math.log2(frequency / 440);
const rms = (samples: Float32Array, start = 0, end = samples.length) => {
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] ** 2;
  return Math.sqrt(sum / Math.max(1, end - start));
};
const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** YIN difference function, downsampled for guitar-range monophonic input. */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
): { frequency: number; confidence: number } | null {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    samples.length < 128 ||
    rms(samples) < 0.003
  )
    return null;
  for (const sample of samples) if (!Number.isFinite(sample)) return null;
  const stride = Math.max(1, Math.floor(sampleRate / 12000));
  const rate = sampleRate / stride;
  const size = Math.min(2048, Math.floor(samples.length / stride));
  const data = new Float32Array(size);
  let average = 0;
  for (let i = 0; i < size; i++) {
    // Box averaging limits high-frequency aliasing before decimation.
    let sum = 0;
    for (let j = 0; j < stride; j++) sum += samples[i * stride + j];
    data[i] = sum / stride;
    average += data[i];
  }
  average /= size;
  for (let i = 0; i < size; i++) data[i] -= average;
  const minLag = Math.max(2, Math.floor(rate / 1400));
  const maxLag = Math.min(Math.floor(rate / 65), Math.floor(size / 2));
  const difference = new Float32Array(maxLag + 1);
  const window = size - maxLag;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < window; i++) sum += (data[i] - data[i + lag]) ** 2;
    running += sum;
    difference[lag] = running > 1e-12 ? (sum * lag) / running : 1;
  }
  for (let lag = minLag; lag < maxLag; lag++) {
    if (difference[lag] >= 0.18) continue;
    while (lag + 1 < maxLag && difference[lag + 1] < difference[lag]) lag++;
    const left = difference[lag - 1],
      middle = difference[lag],
      right = difference[lag + 1];
    const denominator = 2 * (2 * middle - right - left);
    const refined =
      lag +
      (Math.abs(denominator) > 1e-10
        ? clamp((right - left) / denominator, -0.5, 0.5)
        : 0);
    return { frequency: rate / refined, confidence: clamp(1 - middle, 0, 1) };
  }
  return null;
}

/** Attack boundaries plus stable pitch changes. Time is seconds from capture start. */
export function extractNotes(
  samples: Float32Array,
  sampleRate: number,
): DetectedNote[] {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || samples.length < 128)
    return [];
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const window = Math.round(sampleRate * 0.075);
  const notes: DetectedNote[] = [];
  let current: DetectedNote | null = null;
  let previousLevel = 0,
    silentFrames = 0,
    pendingMidi = -1,
    pendingFrames = 0;
  let pendingTime = 0,
    lastAttack = -1;
  let confidenceSum = 0,
    frameCount = 0;
  const finish = (time: number) => {
    if (current) {
      current.duration = Math.max(0, time - current.time);
      current.confidence = confidenceSum / Math.max(1, frameCount);
      if (current.duration >= 0.045) notes.push(current);
    }
    current = null;
    confidenceSum = 0;
    frameCount = 0;
  };
  for (let offset = 0; offset + hop <= samples.length; offset += hop) {
    const time = offset / sampleRate;
    const level = rms(samples, offset, offset + hop);
    const attack =
      level > 0.008 &&
      level > Math.max(0.003, previousLevel) * 1.8 &&
      time - lastAttack > 0.085;
    previousLevel = level;
    if (attack) lastAttack = time;
    const pitch =
      level >= 0.003
        ? detectPitch(
            samples.subarray(offset, Math.min(samples.length, offset + window)),
            sampleRate,
          )
        : null;
    if (!pitch || pitch.confidence < 0.82) {
      silentFrames++;
      if (silentFrames >= 3) finish(time - 0.02);
      continue;
    }
    silentFrames = 0;
    const midi = Math.round(midiOf(pitch.frequency));
    if (!current || attack) {
      finish(time);
      current = { midi, time, duration: 0, confidence: pitch.confidence };
      pendingFrames = 0;
    } else if (midi !== current.midi) {
      if (pendingMidi !== midi) {
        pendingMidi = midi;
        pendingFrames = 0;
        pendingTime = time;
      }
      pendingFrames++;
      if (pendingFrames >= 3) {
        finish(pendingTime);
        current = {
          midi,
          time: pendingTime,
          duration: 0,
          confidence: pitch.confidence,
        };
        pendingFrames = 0;
      }
    } else pendingFrames = 0;
    confidenceSum += pitch.confidence;
    frameCount++;
  }
  finish(samples.length / sampleRate);
  return notes;
}

export function recordingQuality(samples: Float32Array) {
  let clipped = 0,
    invalid = false;
  for (const value of samples) {
    if (!Number.isFinite(value)) invalid = true;
    if (Math.abs(value) >= 0.985) clipped++;
  }
  return {
    invalid,
    clipped: clipped / Math.max(1, samples.length),
    level: rms(samples),
  };
}

/** Ordered edit-distance alignment preserves missing/extra notes instead of shifting all later notes. */
export function analyzeRecording(
  samples: Float32Array,
  sampleRate: number,
  exercise: Exercise,
  bpm: number,
  latencyMs: number | null = null,
  mode: "separated" | "ringing" = "separated",
): Evidence {
  const insufficient = (message: string): Evidence => ({
    diagnostic: "input",
    confidence: "low",
    score: null,
    pitchAccuracy: null,
    timingMs: null,
    missed: 0,
    extra: 0,
    consistency: null,
    message,
  });
  if (mode === "ringing")
    return insufficient(
      "Saved for listening. Ringing strings overlap, so this monophonic detector cannot reliably score their notes or timing. Listen for a steady pulse and connected changes. This take will not change mastery.",
    );
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    !Number.isFinite(bpm) ||
    bpm <= 0 ||
    (latencyMs !== null && (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 250)) ||
    !exercise.notes.length
  )
    return insufficient(
      "This recording cannot be measured. Check the microphone and try again.",
    );
  const quality = recordingQuality(samples);
  if (quality.invalid)
    return insufficient(
      "The recording contains invalid audio. Reconnect the microphone and retry.",
    );
  if (quality.level < 0.003)
    return insufficient(
      "The recording is too quiet. Move closer or raise your input level, then retry.",
    );
  if (quality.clipped > 0.005)
    return insufficient(
      "The input is clipping. Lower your input gain and record again; this take will not change mastery.",
    );
  const detected = extractNotes(samples, sampleRate);
  if (!detected.length)
    return insufficient(
      "I could not isolate a stable single-note pitch. Use a clean tone, reduce background sound and play one string at a time.",
    );
  const hop = Math.round(sampleRate * 0.01);
  let activeSeconds = 0;
  for (let offset = 0; offset + hop <= samples.length; offset += hop)
    if (rms(samples, offset, offset + hop) >= 0.003)
      activeSeconds += hop / sampleRate;
  const voicedSeconds = detected.reduce((sum, note) => sum + note.duration, 0);
  if (voicedSeconds / Math.max(0.01, activeSeconds) < 0.35)
    return insufficient(
      "Most of this take could not be separated into clear notes. Reduce background noise, use a clean tone and retry; this take will not change mastery.",
    );
  const expected = exercise.notes;
  const n = expected.length,
    m = detected.length,
    beat = 60 / bpm;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const path = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    cost[i][0] = i;
    path[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    cost[0][j] = j;
    path[0][j] = 2;
  }
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const pitchCost =
        Math.abs(expected[i - 1].midi - detected[j - 1].midi) <= 0.5 ? 0 : 1.1;
      const timeCost = Math.min(
        0.4,
        (Math.abs(
          detected[j - 1].time - (latencyMs ?? 0) / 1000 - expected[i - 1].beat * beat,
        ) /
          beat) *
          0.2,
      );
      const options = [
        cost[i - 1][j - 1] + pitchCost + timeCost,
        cost[i - 1][j] + 1,
        cost[i][j - 1] + 1,
      ];
      const choice = options.indexOf(Math.min(...options));
      cost[i][j] = options[choice];
      path[i][j] = choice;
    }
  let i = n,
    j = m,
    missed = 0,
    extra = 0,
    correct = 0;
  const errors: { index: number; error: number }[] = [];
  const wrong: number[] = [];
  const substitutions: { index: number; heard: number }[] = [];
  while (i || j) {
    const action = path[i][j];
    if (action === 1) {
      missed++;
      wrong.push(i - 1);
      i--;
    } else if (action === 2) {
      extra++;
      j--;
    } else {
      const index = i - 1;
      if (Math.abs(expected[index].midi - detected[j - 1].midi) <= 0.5)
        correct++;
      else {
        wrong.push(index);
        substitutions.push({ index, heard: detected[j - 1].midi });
      }
      errors.push({
        index,
        error:
          (detected[j - 1].time -
            (latencyMs ?? 0) / 1000 -
            expected[index].beat * beat) *
          1000,
      });
      i--;
      j--;
    }
  }
  const pitchAccuracy = Math.round((100 * correct) / n);
  const timingMs = errors.length
    ? Math.round(mean(errors.map((item) => Math.abs(item.error))))
    : null;
  const offset = mean(errors.map((item) => item.error));
  const spread = Math.sqrt(
    mean(errors.map((item) => (item.error - offset) ** 2)),
  );
  const consistency =
    errors.length > 1
      ? Math.round(clamp(100 - (spread / (beat * 1000)) * 100, 0, 100))
      : null;
  const confidence =
    mean(detected.map((note) => note.confidence)) > 0.94 &&
    quality.level > 0.008
      ? "high"
      : "medium";
  const score = Math.round(
    (100 * correct / Math.max(n, m)) * 0.7 +
      clamp(100 - ((timingMs ?? 1000) / (beat * 1000)) * 130, 0, 100) * 0.3,
  );
  const worst = errors
    .filter((item) => item.index > 0)
    .sort((a, b) => Math.abs(b.error) - Math.abs(a.error))[0];
  // A periodic signal can still be fragmented, overlapping, or the wrong source.
  // honey: conservative heuristic; tune only against annotated real-guitar takes.
  const ambiguous = extra >= Math.max(3, n / 2) ||
    detected.filter((note) => note.duration < 0.09).length > m * 0.3;
  const weakestTransition = wrong.find((index) => index > 0) ??
    (latencyMs !== null ? worst?.index : undefined);
  let message = `Matched ${correct} of ${n} notes. `;
  if (ambiguous)
    return {
      ...insufficient(`Detected ${m} events for ${n} notes, with ${correct} pitch matches. Extra events may be picking, ringing strings or detector splits. Run the four-pluck input check before repeating this bridge. This take will not change mastery.`),
      matched: correct, expected: n, observed: m, missed, extra,
    };
  if (missed || extra)
    message += `${missed} missing, ${extra} extra detections. Replay and count your picks. If the count disagrees, check input before changing tempo. `;
  else if (substitutions.length) {
    const mismatch = substitutions.at(-1)!, target = expected[mismatch.index];
    const name = (midi: number) => `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;
    message += `At note ${mismatch.index + 1}, expected ${name(target.midi)} (string ${target.string}, fret ${target.fret}); detected ${name(mismatch.heard)}. Check tuning, then isolate that note. `;
  }
  else if (latencyMs !== null && (timingMs ?? 0) > beat * 180)
    message += "The notes are there; place each attack on the pulse. ";
  else message += "Repeat once more to show this is consistent. ";
  message += latencyMs !== null
    ? "Timing uses your latency adjustment."
    : "Timing includes unknown device delay. Pitch and event counts are shown separately; no combined score or mastery change is assigned.";
  return {
    diagnostic: latencyMs === null ? "timing" : "practice",
    matched: correct,
    expected: n,
    observed: m,
    confidence,
    score: latencyMs === null ? null : score,
    pitchAccuracy,
    timingMs,
    missed,
    extra,
    consistency,
    weakestTransition,
    message,
  };
}

/** Controlled input check, not a test of playing skill or physical latency. */
export function checkInput(samples: Float32Array, quiet: Float32Array, sampleRate: number) {
  const signal = recordingQuality(samples), noise = recordingQuality(quiet);
  const failed = (message: string) => ({ passed: false, message });
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 ||
      quiet.length < sampleRate || samples.length < sampleRate * 4 ||
      signal.invalid || noise.invalid)
    return failed("Input check was incomplete. Try again with this tab in the foreground.");
  if (signal.clipped > 0.005 || noise.clipped > 0.005)
    return failed("Input is clipping. Lower the input gain, then repeat the check.");
  if (signal.level < 0.003)
    return failed("The guitar is too quiet. Check the selected input and raise the USB dry output level or input gain.");
  if (noise.level > 0.003 || signal.level < noise.level * 4)
    return failed("Sound was present during the quiet count-in. Use headphones, quiet the room and keep the strings still during the count-in.");
  const notes = extractNotes(samples, sampleRate);
  if (notes.length !== 4)
    return failed(`Heard ${notes.length} events for four plucks. If you picked exactly four times, detection is unreliable with this setup. Use a clean tone and stop each note before the next; retry without changing tempo.`);
  if (notes.some((note) => note.midi !== 40 || note.confidence < 0.9))
    return failed("Four events were heard, but not four stable low E notes. Check standard tuning and use only the thickest open string. The detector may also be mistaken.");
  return { passed: true, message: "Four stable low E events heard with a quiet background. This setup passed a simple check; it does not validate overlapping notes or measure device delay. Try the targeted drill, then return to the bridge." };
}

export type MutingComparison = {
  confidence: "medium" | "low";
  baselineDecayMs: number | null;
  mutedDecayMs: number | null;
  reductionPercent: number | null;
  baselineConsistency: number | null;
  mutedConsistency: number | null;
  message: string;
};

/** Relative decay is evidence about sound, never a diagnosis of hand position. */
export function compareMuting(
  baseline: Float32Array,
  muted: Float32Array,
  sampleRate: number,
): MutingComparison {
  const empty: MutingComparison = {
    confidence: "low",
    baselineDecayMs: null,
    mutedDecayMs: null,
    reductionPercent: null,
    baselineConsistency: null,
    mutedConsistency: null,
    message:
      "Record a clear open-string baseline and the same pattern muted, using the same input gain.",
  };
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) return empty;
  for (const samples of [baseline, muted]) {
    const quality = recordingQuality(samples);
    if (quality.invalid || quality.level < 0.003 || quality.clipped > 0.005)
      return empty;
  }
  const decay = (samples: Float32Array) => {
    const hop = Math.round(sampleRate * 0.01);
    const levels: number[] = [];
    for (let i = 0; i + hop <= samples.length; i += hop)
      levels.push(rms(samples, i, i + hop));
    const attacks: number[] = [];
    for (let i = 0; i < levels.length; i++)
      if (
        levels[i] > 0.008 &&
        levels[i] > Math.max(0.003, levels[i - 1] ?? 0) * 1.8 &&
        (!attacks.length || i - attacks[attacks.length - 1] > 8)
      )
        attacks.push(i);
    const values: number[] = [];
    for (let i = 0; i < attacks.length; i++) {
      const start = attacks[i],
        end = attacks[i + 1] ?? levels.length;
      let peak = start;
      for (let j = start + 1; j < Math.min(start + 5, end); j++)
        if (levels[j] > levels[peak]) peak = j;
      // 12 dB amplitude decay. Exclude notes interrupted before the threshold.
      for (let j = peak + 1; j < end; j++)
        if (levels[j] < levels[peak] * 0.2512) {
          values.push((j - peak) * 10);
          break;
        }
    }
    return values;
  };
  const open = decay(baseline),
    damped = decay(muted);
  if (!open.length || !damped.length)
    return {
      ...empty,
      message:
        "Let each note decay longer before the next pick; I could not measure both decay envelopes.",
    };
  const baselineDecayMs = Math.round(mean(open)),
    mutedDecayMs = Math.round(mean(damped));
  const reductionPercent = Math.round(
    100 * (1 - mutedDecayMs / Math.max(1, baselineDecayMs)),
  );
  const consistency = (values: number[]) =>
    values.length < 2
      ? null
      : Math.round(
          clamp(
            100 -
              (Math.sqrt(
                mean(values.map((value) => (value - mean(values)) ** 2)),
              ) /
                Math.max(1, mean(values))) *
                100,
            0,
            100,
          ),
        );
  return {
    confidence: "medium",
    baselineDecayMs,
    mutedDecayMs,
    reductionPercent,
    baselineConsistency: consistency(open),
    mutedConsistency: consistency(damped),
    message:
      reductionPercent > 15
        ? `The muted take decays ${reductionPercent}% faster than your open baseline. Repeat with the same picking strength to check consistency. Audio cannot confirm your hand position.`
        : "The decay is similar to your open baseline. Try slightly more contact near the bridge and compare again. Gain, picking strength and effects can also change decay.",
  };
}

export type CapturedAudio = {
  samples: Float32Array;
  sampleRate: number;
  startedAt: number;
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private input: MediaStreamAudioSourceNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private generation = 0;
  get inputInfo() { return this.stream?.getAudioTracks()[0]?.getSettings(); }
  private worklet: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private recording = false;
  private startedAt = 0;
  private clickTimer: ReturnType<typeof setInterval> | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private clicks = new Set<AudioScheduledSourceNode>();
  private stopResolve: ((audio: CapturedAudio) => void) | null = null;
  private captureStop: Promise<CapturedAudio> | null = null;
  private closing: Promise<void> | null = null;

  get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  private async ready() {
    if (this.closing) await this.closing;
    this.context ??= new AudioContext({ latencyHint: "interactive" });
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  async prepareMicrophone(
    onFrame?: (samples: Float32Array, sampleRate: number) => void,
    selection = loadInput(),
  ) {
    if (!selection) throw new Error("Choose your input in Audio setup first.");
    const generation = this.generation;
    const context = await this.ready();
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "Microphone access requires HTTPS or localhost in a supported browser.",
      );
    if (this.worklet) return;
    const stream = await navigator.mediaDevices.getUserMedia(inputConstraints(selection)).catch((error) => { throw new Error(inputError(error)); });
    try {
      if (generation !== this.generation) throw new Error("Audio setup was cancelled.");
      const settings = stream.getAudioTracks()[0].getSettings();
      if (settings.deviceId !== selection.deviceId) throw new Error("The browser did not open the selected input. Select it again; no fallback is allowed.");
      if (selection.channel >= (settings.channelCount ?? 1)) throw new Error("This input does not expose that channel. Select channel 1 or a different Windows audio endpoint.");
      await context.audioWorklet.addModule("/audio-worklet.js");
      if (generation !== this.generation) throw new Error("Audio setup was cancelled.");
      this.stream = stream;
      this.input = context.createMediaStreamSource(stream);
      this.worklet = new AudioWorkletNode(context, "riff-capture");
      this.worklet.port.onmessage = (
        event: MessageEvent<{
          samples?: Float32Array;
          time?: number;
          flushed?: boolean;
        }>,
      ) => {
        if (event.data.samples) {
          const samples = event.data.samples;
          onFrame?.(samples, context.sampleRate);
          if (this.recording) {
            const skip = Math.max(
              0,
              Math.round(
                (this.startedAt - (event.data.time ?? this.startedAt)) *
                  context.sampleRate,
              ),
            );
            if (skip < samples.length) this.chunks.push(samples.slice(skip));
          }
        }
        if (event.data.flushed && this.stopResolve) {
          this.recording = false;
          const samples = new Float32Array(
            this.chunks.reduce((sum, chunk) => sum + chunk.length, 0),
          );
          let offset = 0;
          for (const chunk of this.chunks) {
            samples.set(chunk, offset);
            offset += chunk.length;
          }
          this.chunks = [];
          this.stopResolve({
            samples,
            sampleRate: context.sampleRate,
            startedAt: this.startedAt,
          });
          this.stopResolve = null;
        }
      };
      // The processor writes zeros to its output: microphone is never monitored.
      this.splitter = context.createChannelSplitter(settings.channelCount ?? 1);
      this.input.connect(this.splitter);
      this.splitter.connect(this.worklet, selection.channel, 0);
      this.worklet.connect(context.destination);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }

  startCapture(): number {
    if (!this.context || !this.worklet)
      throw new Error("Prepare the microphone before recording.");
    if (this.recording || this.stopResolve)
      throw new Error("A recording is already running.");
    this.chunks = [];
    this.captureStop = null;
    this.startedAt = this.context.currentTime;
    this.recording = true;
    return this.startedAt;
  }

  async stopCapture(): Promise<CapturedAudio> {
    if (this.captureStop) return this.captureStop;
    if (!this.recording || !this.worklet || !this.context)
      throw new Error("No recording is running.");
    this.captureStop = new Promise((resolve) => {
      this.stopResolve = resolve;
      this.worklet!.port.postMessage("flush");
    });
    return this.captureStop;
  }

  private tone(
    context: AudioContext,
    midi: number,
    duration: number,
    when: number,
    volume = 0.16,
  ) {
    const voice = context.createOscillator(),
      gain = context.createGain();
    voice.type = "triangle";
    voice.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      when + Math.max(0.03, duration),
    );
    voice.connect(gain);
    gain.connect(context.destination);
    this.voices.add(voice);
    voice.onended = () => {
      this.voices.delete(voice);
      this.clicks.delete(voice);
      voice.disconnect();
      gain.disconnect();
    };
    voice.start(when);
    voice.stop(when + Math.max(0.04, duration) + 0.02);
    return voice;
  }

  async playTone(midi: number, duration = 0.4) {
    const context = await this.ready();
    this.tone(context, midi, duration, context.currentTime + 0.02);
  }

  async playExercise(exercise: Exercise, bpm: number) {
    if (!Number.isFinite(bpm) || bpm <= 0) return;
    this.stopPlayback();
    const context = await this.ready(),
      start = context.currentTime + 0.05;
    for (const note of exercise.notes)
      this.tone(
        context,
        note.midi,
        ((note.duration * 60) / bpm) * 0.8,
        start + (note.beat * 60) / bpm,
      );
    return start;
  }

  async startMetronome(bpm: number, beatsPerBar = 6): Promise<number> {
    if (!Number.isFinite(bpm) || bpm <= 0)
      throw new Error("Tempo must be positive.");
    this.stopMetronome();
    const context = await this.ready();
    let next = context.currentTime + 0.05,
      pulse = 0;
    const start = next;
    const schedule = () => {
      while (next < context.currentTime + 0.1) {
        this.clicks.add(
          this.tone(
            context,
            pulse % beatsPerBar === 0 ? 96 : 89,
            0.035,
            next,
            0.07,
          ),
        );
        next += 60 / bpm;
        pulse++;
      }
    };
    schedule();
    this.clickTimer = setInterval(schedule, 25);
    return start;
  }

  stopMetronome() {
    if (this.clickTimer) clearInterval(this.clickTimer);
    this.clickTimer = null;
    for (const click of this.clicks) {
      try {
        click.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.clicks.clear();
  }
  stopPlayback() {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.voices.clear();
  }
  async close() {
    this.generation++;
    if (this.closing) return this.closing;
    this.closing = (async () => {
      this.stopMetronome();
      this.stopPlayback();
      if (this.recording) await this.stopCapture();
      this.worklet?.disconnect();
      this.input?.disconnect();
      this.splitter?.disconnect();
      this.stream?.getTracks().forEach((track) => track.stop());
      if (this.context?.state !== "closed") await this.context?.close();
      this.context = null;
      this.worklet = null;
      this.input = null;
      this.splitter = null;
      this.stream = null;
    })();
    try {
      await this.closing;
    } finally {
      this.closing = null;
    }
  }
}
