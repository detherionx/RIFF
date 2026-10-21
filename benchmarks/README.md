# Local detector benchmark

This separate package compares RIFF's YIN extractor and Spotify Basic Pitch 1.0.1 using TensorFlow.js 3.21.0 on CPU in a browser worker. It is not imported by the practice app. No microphone, camera, personal files, external runtime requests or inference services are used. Models and runtime are served from localhost; the page restricts connections to its own origin.

From this directory:

```sh
npm ci
npm run build
python -m http.server 3019 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:3019 and choose **Run benchmark**. Stop, leaving the page or hiding the tab terminates the worker. The checked-in result is `results-2026-10-19.json`.

## Measured 19 October 2026

Desktop Windows Chromium 155, one run per fixture, no warm-up, four seconds of audio at 22,050 Hz. Timing includes extraction/postprocessing, excludes model initialization. Precision and recall require matching MIDI pitch and onset within 100 ms, using one-to-one maximum matching. This does not measure note offsets or playing technique. Silence has undefined precision/recall and is reported as null.

| Fixture | YIN time | YIN false events | Basic Pitch CPU time | Basic Pitch false events |
|---|---:|---:|---:|---:|
| Separated harmonic tones | 144 ms | 0 | 8,056 ms | 16 |
| Overlapping decays | 265 ms | 0 | 7,761 ms | 22 |
| Tones plus seeded noise | 289 ms | 3 | 7,673 ms | 17 |
| Silence | <1 ms | 0 | 7,570 ms | 0 |

Both extractors matched all four expected fundamentals on the three non-silent fixtures. Basic Pitch thresholds are 0.25 onset/frame probability and a five-frame minimum note length, following the project's example; these are not tuned for RIFF. Synthetic harmonics can trigger additional transcribed pitches. Do not generalize this result to real guitar recordings or all possible model configurations.

Model initialization: 91 ms. Local files: weights 742,392 bytes; graph JSON 174,537 bytes; bundled worker 1,142,810 bytes, before HTTP compression. These are file sizes, not peak RAM. TFJS reported 19,311,936 tensor bytes remaining after model disposal in this run; worker termination releases the entire worker context. Investigate tensor lifecycle before any long-lived integration. No peak heap/GPU/battery measurement was performed.

Decision: keep Basic Pitch experimental. This CPU configuration is slower than real time and offers no benefit on these fixtures. YIN's three false events under noise demonstrate why detection checks and abstention must precede technique advice.

## Next acceptance gate

Use consented, locally held, player-disjoint annotated guitar recordings: clean electric/acoustic, separated/ringing notes, quiet/noisy/clipped input, phone microphones/interfaces, and different tempos. Split tuning/development data from held-out evaluation. Measure pitch/onset/offset precision and recall, false events per minute, abstention, false mastery changes, cold initialization, p50/p95 inference, long tasks, sustained memory growth and battery on representative phones. Compare against existing YIN and simple signal-processing improvements before adding model complexity.

Proposed release requirements (not validated thresholds): no progression from unsupported input; lower false-positive rate on held-out data without materially worse recall; no main-thread inference; bounded memory over 20 successive takes; full audio practice without model loading. Evaluate WebGL/WASM and a small CREPE variant separately. Neither was benchmarked here. MediaPipe is a separate framing/hand-visibility experiment, not a guitar technique grader.

Sources: [Basic Pitch TypeScript](https://github.com/spotify/basic-pitch-ts), [CREPE author repository](https://github.com/marl/crepe), [MediaPipe web hand-landmark guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js). Include the Basic Pitch Apache-2.0 license when distributing its model assets; the build copies it into `dist`.
