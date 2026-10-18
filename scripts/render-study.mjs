// Reproduce with: npx tsx scripts/render-study.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { exercises } from '../lib/curriculum.ts';

const study = exercises.find(exercise => exercise.id === 'first-light-study');
assert.ok(study && study.notes.length === 48, 'The reference expects the original eight-bar study.');
const rate = 44100, bpm = 100, pulse = 60 / bpm;
const samples = new Float64Array(Math.round((study.beats * pulse + .8) * rate));
const dynamics = [.57, .62, .68, .73, .8, .9, .72, .54];
let seed = 20261018;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;

for (const [index, note] of study.notes.entries()) {
  const frequency = 440 * 2 ** ((note.midi - 69) / 12);
  // Fractional string delay compensates the averaging filter's half-sample delay.
  const delay = rate / frequency - .5, size = Math.ceil(delay) + 2;
  const string = Float64Array.from({ length: size }, (_, i) => random() * .3 + Math.sin(2 * Math.PI * i / delay) * .55);
  const dc = string.reduce((sum, value) => sum + value, 0) / size;
  for (let i = 0; i < size; i++) string[i] -= dc;
  const start = Math.round(note.beat * pulse * rate);
  const next = study.notes.slice(index + 1).find(candidate => candidate.string === note.string);
  const duration = Math.min(2.5, next ? (next.beat - note.beat) * pulse : 2.5);
  const length = Math.min(Math.round(duration * rate), samples.length - start);
  const strength = dynamics[Math.floor(note.beat / 6)] * (note.beat % 6 === 0 ? 1.12 : note.beat % 6 === 3 ? 1.05 : 1);
  const damping = Math.exp(-1 / (frequency * 1.3));
  let write = 0, previous = 0;
  for (let i = 0; i < length; i++) {
    const read = (write - delay + size) % size, left = Math.floor(read), fraction = read - left;
    const value = string[left] * (1 - fraction) + string[(left + 1) % size] * fraction;
    string[write] = (value + previous) * .5 * damping;
    previous = value; write = (write + 1) % size;
    const attack = Math.min(1, i / (rate * .003));
    const release = Math.min(1, (length - i) / (rate * .06));
    samples[start + i] += value * strength * attack * release;
  }
}

let peak = 0, energy = 0;
for (const sample of samples) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); energy += sample ** 2; }
assert.ok(peak > .01 && energy / samples.length > .0001, 'Reference must contain audible signal.');
const gain = .86 / peak;
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] * gain * 32767), 44 + i * 2);
const destination = new URL('../public/first-light.wav', import.meta.url);
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
writeFileSync(destination, wav);
console.log(JSON.stringify({ file: 'public/first-light.wav', seconds: samples.length / rate, notes: study.notes.length, sampleRate: rate, channels: 1, bits: 16, bytes: wav.length, peak: .86, sha256: createHash('sha256').update(wav).digest('hex') }));
