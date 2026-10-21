import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  analyzeRecording,
  compareMuting,
  detectPitch,
  extractNotes,
  checkInput,
} from "../lib/audio";
import type { Exercise } from "../lib/types";

const rate = 16000;
function tone(midi: number, seconds = 0.35, decay = 0.2) {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  return Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => {
    const time = i / rate;
    return (
      0.35 *
      Math.min(1, time / 0.004) *
      Math.exp(-time / decay) *
      (Math.sin(2 * Math.PI * frequency * time) +
        0.25 * Math.sin(4 * Math.PI * frequency * time))
    );
  });
}
function sequence(
  notes: { midi: number; time: number }[],
  seconds = 2.5,
  decay = 0.2,
) {
  const samples = new Float32Array(Math.round(seconds * rate));
  for (const note of notes) {
    const signal = tone(note.midi, 0.35, decay),
      offset = Math.round(note.time * rate);
    for (let i = 0; i < signal.length && i + offset < samples.length; i++)
      samples[i + offset] += signal[i];
  }
  return samples;
}
const exercise: Exercise = {
  id: "test",
  title: "test",
  subtitle: "",
  skill: "strings",
  stage: 1,
  bpm: 120,
  beats: 4,
  kind: "playing",
  instructions: [],
  why: "",
  notes: [40, 42, 44, 45].map((midi, beat) => ({
    midi,
    beat,
    duration: 0.5,
    string: 6,
    fret: midi - 40,
  })),
};
const correct = exercise.notes.map((note) => ({
  midi: note.midi,
  time: note.beat * 0.5,
}));

test("YIN detects low E and upper guitar notes with harmonics", () => {
  for (const midi of [40, 45, 52, 64, 76, 88]) {
    const pitch = detectPitch(tone(midi).subarray(0, 1600), rate);
    assert.ok(pitch, `midi ${midi}`);
    assert.ok(
      Math.abs(69 + 12 * Math.log2(pitch.frequency / 440) - midi) < 0.12,
      `${midi}: ${pitch.frequency}`,
    );
    assert.ok(pitch.confidence > 0.9);
  }
});
test("pitch works at native browser sample rates", () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const samples = Float32Array.from(
      { length: Math.round(sampleRate * 0.075) },
      (_, i) => 0.2 * Math.sin((2 * Math.PI * 82.4069 * i) / sampleRate),
    );
    const pitch = detectPitch(samples, sampleRate);
    assert.ok(pitch);
    assert.ok(Math.abs(pitch.frequency - 82.4069) < 0.3);
  }
});
test("silence, DC and deterministic broadband noise do not become pitches", () => {
  assert.equal(detectPitch(new Float32Array(2048), rate), null);
  assert.equal(detectPitch(new Float32Array(2048).fill(0.1), rate), null);
  let state = 17;
  const noise = Float32Array.from({ length: 2048 }, () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 2 ** 32 - 0.5) * 0.3;
  });
  assert.equal(detectPitch(noise, rate), null);
  assert.equal(
    detectPitch(new Float32Array(2048).fill(Number.NaN), rate),
    null,
  );
});
test("separate repeated attacks remain separate notes", () => {
  const notes = extractNotes(
    sequence([0, 0.5, 1, 1.5].map((time) => ({ midi: 40, time }))),
    rate,
  );
  assert.equal(notes.length, 4);
  assert.deepEqual(
    notes.map((note) => note.midi),
    [40, 40, 40, 40],
  );
});
test("rhythmic muted attacks remain distinct with decaying tails", () => {
  const pattern = Array.from({ length: 8 }, (_, index) => ({
    midi: 40,
    time: index * 0.25,
  }));
  const notes = extractNotes(sequence(pattern, 2.1, 0.08), rate);
  assert.equal(notes.length, 8);
  notes.forEach((note, index) => {
    assert.equal(note.midi, 40);
    assert.ok(Math.abs(note.time - pattern[index].time) <= 0.03);
  });
});
test("clean sequence gets measured high-quality evidence", () => {
  const evidence = analyzeRecording(sequence(correct), rate, exercise, 120, 0);
  assert.equal(evidence.pitchAccuracy, 100);
  assert.equal(evidence.missed, 0);
  assert.equal(evidence.extra, 0);
  assert.ok(evidence.score! >= 95);
  assert.ok(evidence.timingMs! < 30);
});
test("alignment preserves later matches after a missing note", () => {
  const evidence = analyzeRecording(
    sequence(correct.filter((_, i) => i !== 1)),
    rate,
    exercise,
    120,
  );
  assert.equal(evidence.missed, 1);
  assert.equal(evidence.extra, 0);
  assert.equal(evidence.pitchAccuracy, 75);
  assert.equal(evidence.weakestTransition, 1);
});
test("alignment counts an extra attack without shifting the sequence", () => {
  const evidence = analyzeRecording(
    sequence([...correct, { midi: 47, time: 2 }]),
    rate,
    exercise,
    120,
  );
  assert.equal(evidence.extra, 1);
  assert.equal(evidence.missed, 0);
  assert.equal(evidence.pitchAccuracy, 100);
});
test("silence and clipping abstain rather than manufacturing a score", () => {
  for (const samples of [
    new Float32Array(rate),
    new Float32Array(rate).fill(1),
  ]) {
    const evidence = analyzeRecording(samples, rate, exercise, 120);
    assert.equal(evidence.confidence, "low");
    assert.equal(evidence.score, null);
    assert.equal(evidence.pitchAccuracy, null);
  }
});
test("a mostly noisy take with a short detectable note abstains", () => {
  let state = 91;
  const samples = sequence([{ midi: 40, time: 0 }]);
  for (let i = rate / 2; i < samples.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    samples[i] = (state / 2 ** 32 - 0.5) * 0.3;
  }
  assert.equal(analyzeRecording(samples, rate, exercise, 120).score, null);
});
test("timing retains global lateness unless explicitly calibrated", () => {
  const late = sequence(
    correct.map((note) => ({ ...note, time: note.time + 0.15 })),
  );
  const raw = analyzeRecording(late, rate, exercise, 120);
  const calibrated = analyzeRecording(late, rate, exercise, 120, 150);
  assert.ok(raw.timingMs! >= 140);
  assert.ok(calibrated.timingMs! <= 20);
  assert.equal(raw.diagnostic, "timing");
  assert.equal(calibrated.diagnostic, "practice");
});

test("unknown latency and a measured zero remain different", () => {
  assert.equal(analyzeRecording(sequence(correct), rate, exercise, 120).score, null);
  assert.equal(analyzeRecording(sequence(correct), rate, exercise, 120).diagnostic, "timing");
  assert.equal(analyzeRecording(sequence(correct), rate, exercise, 120, 0).diagnostic, "practice");
});

test("many extra events abstain before blaming playing or selecting a transition", () => {
  const signal = sequence(Array.from({ length: 8 }, (_, i) => ({ midi: exercise.notes[i % 4].midi, time: i * 0.5 })), 4.2);
  const result = analyzeRecording(signal, rate, exercise, 120, 0);
  assert.equal(result.diagnostic, "input");
  assert.equal(result.score, null);
  assert.equal(result.observed, 8);
  assert.equal(result.weakestTransition, undefined);
});

test("four-pluck check requires quiet background, clean signal and exactly four low E events", () => {
  const quiet = new Float32Array(rate * 2);
  const plucks = [0, 2, 4, 6].map((time) => ({ midi: 40, time }));
  assert.equal(checkInput(sequence(plucks, 8), quiet, rate).passed, true);
  assert.equal(checkInput(sequence(plucks.slice(1), 8), quiet, rate).passed, false);
  assert.equal(checkInput(sequence([...plucks, { midi: 40, time: 7 }], 8), quiet, rate).passed, false);
  assert.equal(checkInput(sequence(plucks.map((n) => ({ ...n, midi: 45 })), 8), quiet, rate).passed, false);
  assert.equal(checkInput(sequence(plucks, 8), new Float32Array(rate * 2).fill(0.02), rate).passed, false);
  assert.equal(checkInput(new Float32Array(rate * 8).fill(1), quiet, rate).passed, false);
  assert.equal(checkInput(sequence(plucks, 8), quiet.subarray(0, 10), rate).passed, false);
});
test("ringing arpeggio review never assigns unreliable pitch accuracy", () => {
  const samples = new Float32Array(rate * 3);
  for (const [index, midi] of [40, 55, 59, 64].entries()) {
    const frequency = 440 * 2 ** ((midi - 69) / 12),
      start = (index * rate) / 2;
    for (let i = 0; i < rate * 1.5 && start + i < samples.length; i++)
      samples[start + i] +=
        0.12 *
        Math.min(1, i / 80) *
        Math.exp(-i / rate / 0.65) *
        Math.sin((2 * Math.PI * frequency * i) / rate);
  }
  const evidence = analyzeRecording(samples, rate, exercise, 120, 0, "ringing");
  assert.equal(evidence.score, null);
  assert.equal(evidence.pitchAccuracy, null);
  assert.equal(evidence.timingMs, null);
  assert.match(evidence.message, /cannot reliably score/);
});
test("muting compares relative decay and rejects silence", () => {
  const open = tone(40, 1, 0.4),
    muted = tone(40, 1, 0.1);
  const result = compareMuting(open, muted, rate);
  assert.equal(result.confidence, "medium");
  assert.ok(result.reductionPercent! > 60);
  assert.equal(
    compareMuting(open, new Float32Array(rate), rate).confidence,
    "low",
  );
});
test("worklet preserves PCM, timestamps, partial flush and silent output", () => {
  type Processor = {
    offset: number;
    process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
    port: { onmessage: (event: { data: string }) => void };
  };
  const messages: {
    samples?: Float32Array;
    time?: number;
    flushed?: boolean;
  }[] = [];
  let ProcessorClass: (new () => Processor) | undefined;
  const globals = {
    AudioWorkletProcessor: class {
      port = {
        postMessage: (message: (typeof messages)[number]) =>
          messages.push(message),
      };
    },
    registerProcessor: (_name: string, constructor: new () => Processor) => {
      ProcessorClass = constructor;
    },
    sampleRate: 48000,
    currentTime: 0,
  };
  runInNewContext(
    readFileSync(
      new URL("../public/audio-worklet.js", import.meta.url),
      "utf8",
    ),
    globals,
  );
  const processor = new ProcessorClass!();
  for (let block = 0; block < 33; block++) {
    globals.currentTime = (block * 128) / 48000;
    const output = new Float32Array(128).fill(1);
    processor.process([[new Float32Array(128).fill(0.25)]], [[output]]);
    assert.ok(output.every((value) => value === 0));
  }
  processor.port.onmessage({ data: "flush" });
  assert.equal(messages.length, 3);
  assert.equal(messages[0].samples!.length, 4096);
  assert.equal(messages[0].time, 0);
  assert.ok(messages[0].samples!.every((value) => value === 0.25));
  assert.equal(messages[1].samples!.length, 128);
  assert.equal(messages[1].time, 4096 / 48000);
  assert.equal(messages[2].flushed, true);
});
