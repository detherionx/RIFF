import test from "node:test";
import assert from "node:assert/strict";
import { EphemeralCamera } from "../lib/video";

test("camera bounds memory, revokes clips and rejects late permission/recorder callbacks", async (t) => {
  let stopped = 0, requests = 0;
  const track = { stop: () => stopped++, onended: null };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const revoked: string[] = [];
  let created = 0;
  let release: ((stream: unknown) => void) | undefined;
  t.mock.method(URL, "createObjectURL", () => `blob:test-${++created}`);
  t.mock.method(URL, "revokeObjectURL", (url: string) => revoked.push(url));
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: {
    getUserMedia: async (constraints: MediaStreamConstraints) => {
      requests++;
      assert.equal(constraints.audio, false);
      return new Promise((resolve) => { release = resolve; });
    },
  } } });
  class Recorder {
    static last: Recorder;
    static isTypeSupported() { return true; }
    state = "inactive";
    mimeType = "video/webm";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    constructor() { Recorder.last = this; }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; }
  }
  Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: Recorder });
  const errors: string[] = [];
  const camera = new EphemeralCamera(() => {}, (error) => errors.push(error));
  const pending = camera.open();
  camera.close();
  release!(stream);
  await pending;
  assert.equal(camera.stream, null);
  assert.equal(stopped, 1);
  const opening = camera.open();
  release!(stream);
  await opening;
  camera.record();
  Recorder.last.ondataavailable!({ data: new Blob(["video"]) });
  camera.stop();
  Recorder.last.onstop!();
  assert.equal(camera.url, "blob:test-1");
  camera.record();
  assert.deepEqual(revoked, ["blob:test-1"]);
  const stale = Recorder.last;
  camera.close();
  stale.ondataavailable!({ data: new Blob(["late bytes"]) });
  stale.onstop!();
  assert.equal(camera.url, "");
  assert.equal(created, 1);
  assert.equal(stopped, 2);
  const again = camera.open();
  release!(stream);
  await again;
  camera.record();
  Recorder.last.ondataavailable!({ data: { size: 33 * 1024 * 1024 } as Blob });
  assert.equal(camera.stream, null);
  assert.equal(camera.url, "");
  assert.equal(errors.length, 1);
  assert.equal(requests, 3);
});
