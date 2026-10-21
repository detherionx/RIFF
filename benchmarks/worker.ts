import * as tf from "@tensorflow/tfjs";
import { BasicPitch, noteFramesToTime, outputToNotesPoly } from "@spotify/basic-pitch";
import { extractNotes } from "../lib/audio";
import { metrics, type Event } from "./metrics";

const rate = 22050;
const notes = [40, 48, 40, 48].map((midi, i) => ({ midi, time: 0.25 + i * 0.75 }));
function synth(events: Event[], ringing = false, noise = false) {
  const samples = new Float32Array(rate * 4);
  for (const note of events) {
    const start = Math.round(note.time * rate), frequency = 440 * 2 ** ((note.midi - 69) / 12);
    for (let i = 0; i < rate * (ringing ? 1.5 : 0.45) && start + i < samples.length; i++) {
      const t = i / rate;
      samples[start + i] += 0.25 * Math.min(1, t / 0.004) * Math.exp(-t / (ringing ? 0.65 : 0.2)) *
        (Math.sin(2 * Math.PI * frequency * t) + 0.25 * Math.sin(4 * Math.PI * frequency * t));
    }
  }
  if (noise) {
    let seed = 17;
    for (let i = 0; i < samples.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; samples[i] += (seed / 2 ** 32 - 0.5) * 0.12; }
  }
  return samples;
}
const fixtures = [
  { id: "separated", events: notes, ringing: false, noise: false },
  { id: "ringing", events: notes, ringing: true, noise: false },
  { id: "noisy", events: notes, ringing: false, noise: true },
  { id: "silence", events: [], ringing: false, noise: false },
];
self.onmessage = async () => {
  try {
    const results = [];
    for (const fixture of fixtures) {
      const input = synth(fixture.events, fixture.ringing, fixture.noise), start = performance.now();
      const observed = extractNotes(input, rate);
      results.push({ detector: "YIN", fixture: fixture.id, inferenceMs: performance.now() - start, ...metrics(fixture.events, observed) });
    }
    self.postMessage({ status: "Baseline complete. Loading Basic Pitch locally…", results });
    await tf.setBackend("cpu");
    await tf.ready();
    const start = performance.now();
    const basic = new BasicPitch("./model/model.json");
    const model = await basic.model;
    const initializationMs = performance.now() - start;
    for (const fixture of fixtures) {
      self.postMessage({ status: `Basic Pitch CPU: ${fixture.id}…` });
      const input = synth(fixture.events, fixture.ringing, fixture.noise);
      const frames: number[][] = [], onsets: number[][] = [];
      const start = performance.now();
      await basic.evaluateModel(input, (f, o) => { frames.push(...f); onsets.push(...o); }, () => {});
      const observed = noteFramesToTime(outputToNotesPoly(frames, onsets, 0.25, 0.25, 5))
        .map((note) => ({ midi: note.pitchMidi, time: note.startTimeSeconds }));
      results.push({ detector: "Basic Pitch 1.0.1 / TFJS 3.21 CPU", fixture: fixture.id, inferenceMs: performance.now() - start,
        tensorBytesAfterInference: tf.memory().numBytes, ...metrics(fixture.events, observed) });
    }
    model.dispose();
    self.postMessage({ status: "Complete. Synthetic fixtures only; no guitar accuracy claim.", results, initializationMs,
      sampleRate: rate, durationSeconds: 4, onsetToleranceMs: 100, tensorBytesAfterDispose: tf.memory().numBytes });
  } catch (error) { self.postMessage({ status: "Benchmark failed", error: String(error) }); }
};
