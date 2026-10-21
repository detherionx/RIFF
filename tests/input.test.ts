import test from "node:test";
import assert from "node:assert/strict";
import { AudioEngine } from "../lib/audio";
import { inputConstraints, inputError, loadInput, saveInput } from "../lib/input";

test("input selection is exact, processing disabled, invalid channels rejected", () => {
  assert.deepEqual(inputConstraints({ deviceId: "dry", channel: 1 }), { audio: {
    deviceId: { exact: "dry" }, channelCount: { ideal: 2 }, echoCancellation: false,
    noiseSuppression: false, autoGainControl: false }, video: false });
  for (const channel of [-1, 2, NaN, 0.5]) assert.throws(() => inputConstraints({ deviceId: "dry", channel }));
  assert.throws(() => inputConstraints({ deviceId: "", channel: 0 }));
  assert.match(inputError(new DOMException("", "OverconstrainedError")), /not switched microphones/);
});
test("preferences tolerate denied or malformed storage without touching progress", () => {
  let stored = "garbage";
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: () => stored, setItem: (key: string, value: string) => { assert.equal(key, "riff.input.v1"); stored = value; },
  } });
  assert.equal(loadInput(), null);
  assert.equal(saveInput({ deviceId: "dry", channel: 1 }), true);
  assert.deepEqual(loadInput(), { deviceId: "dry", channel: 1 });
  stored = '{"deviceId":"dry","channel":99}'; assert.equal(loadInput(), null);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("denied"); } });
  assert.equal(loadInput(), null); assert.equal(saveInput({ deviceId: "dry", channel: 0 }), false);
  Reflect.deleteProperty(globalThis, "localStorage");
});
test("audio opens chosen stereo channel, never falls back, releases late grants", async () => {
  let stopped = 0, routed = -1, requested: MediaStreamConstraints | undefined;
  let settings = { deviceId: "dry", channelCount: 2 };
  const node = () => ({ connect: (_target: unknown, channel: number) => { if (channel !== undefined) routed = channel; }, disconnect() {} });
  const stream = { getTracks: () => [{ stop: () => { stopped++; } }], getAudioTracks: () => [{ getSettings: () => settings }] };
  const originals = ["navigator", "AudioContext", "AudioWorkletNode"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let grant: ((value: typeof stream) => void) | null = null;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async (constraints: MediaStreamConstraints) => { requested = constraints; return stream; } } } });
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: class {
    state = "running"; destination = {}; audioWorklet = { addModule: async () => {} };
    createMediaStreamSource() { return node(); } createChannelSplitter() { return node(); }
    async close() { this.state = "closed"; }
  } });
  Object.defineProperty(globalThis, "AudioWorkletNode", { configurable: true, value: class { port = {}; connect() {} disconnect() {} } });
  try {
    const audio = new AudioEngine(); await audio.prepareMicrophone(undefined, { deviceId: "dry", channel: 1 });
    assert.equal(routed, 1); assert.deepEqual((requested!.audio as MediaTrackConstraints).deviceId, { exact: "dry" });
    await audio.close(); assert.equal(stopped, 1);
    settings = { deviceId: "wrong", channelCount: 2 };
    const wrong = new AudioEngine(); await assert.rejects(wrong.prepareMicrophone(undefined, { deviceId: "dry", channel: 0 }), /did not open/); await wrong.close();
    assert.equal(stopped, 2);
    navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { grant = resolve as unknown as typeof grant; });
    const late = new AudioEngine(), opening = late.prepareMicrophone(undefined, { deviceId: "dry", channel: 0 });
    await Promise.resolve(); await Promise.resolve(); await late.close();
    grant!(stream); await assert.rejects(opening, /cancelled/); assert.equal(stopped, 3);
  } finally {
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
