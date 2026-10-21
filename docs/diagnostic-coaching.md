# Diagnostic coaching: audit and implementation

Inspected connected `detherionx/RIFF` main at `75de13e856a770831df3d0e5c1e191fa59b0f0c1`, alongside the existing local checkout. The review changes are now integrated into the actual repository alongside explicit Katana input setup. See [hardware validation](katana-validation.md) for measured versus pending acceptance.

## What the screenshot establishes

The supplied screenshot shows Bridge the gap at 55 pulses/min: 45/100, 44% note match, 429 ms timing deviation, eight extra events, medium confidence. Its message says seven of eight notes matched, zero missing and eight extra. The existing score uses `correct / max(expected, detected)`: 7/16 rounds to 44%, not 7/8. That label conflates pitch coverage with extra-event penalties. Timing includes unmeasured device delay.

These numbers cannot establish bad fingering, excess tension, a muting problem or eight actual extra picks. They are compatible with playing errors, overlap, noise, pitch changes within one note or fragmented detections. The original recording is unavailable; no diagnosis of this take's cause is possible.

## Findings

| Area | Existing implementation | Change |
|---|---|---|
| Bridge | Four repetitions of a selected pair; each failed bridge lowers tempo, indefinitely | Repeated failures enter diagnostic mode at the current tempo. Same rule catches the legacy screenshot. |
| Detection | YIN, 10 ms hops, 75 ms forward pitch windows, energy attacks plus pitch changes; monophonic | Preserve detector pending real-guitar validation. Large extra-event counts or many tiny segments abstain. Four-pluck check tests simple detection. |
| Confidence | Periodicity and level could earn medium/high confidence despite sequence ambiguity | Ambiguous takes have null score and no mastery effect. Explain that signal confidence is not diagnostic certainty. |
| Metrics | Seven matches could display 44% “Note match” | Use matched / expected for pitch coverage; display extra and detected-event counts separately. |
| Calibration | Manual 0–250 ms slider; zero meant both unknown and measured zero | Explicit measured-delay state. Unknown delay suppresses the combined score and cannot alter mastery. No auto-shifting against the user's playing. |
| Feedback | Generic slow-down message; transition chosen from wrong pitches/absolute timing | Name expected and detected pitches for substitutions. Offer one-note and pulse-only drills. No transition selection from unknown absolute timing alone. |
| Camera | Separate two-minute recorder, file chooser and download; cleanup on unmount, no hidden-tab cleanup | Opt-in silent camera accompanies the take. One bounded temporary clip, no file import/export, discard on replacement, hide, exit, failure or camera off. |
| Persistence | Local progress plus explicit server backup; strict schemas | Optional numeric diagnostic summaries added to both schemas. No media fields. Drills/check passes stay in session memory and do not award mastery. |
| Tests | Synthetic DSP, adaptation, persistence/API; no real-guitar corpus | Screenshot regression, controlled input checks, measured-zero distinction, provisional mastery gate, camera lifecycle/races/caps, benchmark matching, schema round-trip/media rejection. |

## The coaching loop

1. **Check input.** At 60 pulses/min, stay silent through six count-in pulses, then pick the thickest open E string on 1, 3, 5 and 7. Stop each note after one pulse. Inspect quiet background, level/clipping and exactly four stable low E events. A mismatch gives a specific input/tuning/count check, not a playing verdict.
2. **Isolate the target note.** Repeat the suspected destination note four times. For the screenshot's first bridge, that is C3, string 5 fret 3, after open low E. Compare the displayed pitch and synthesized reference. Aim for four matching events without extras twice.
3. **Isolate the pulse.** Four open low E attacks remove the string change. Compare attack evenness, which is insensitive to a constant delay. Aim for four matches, no extras and evenness of at least 90 twice. This is a practice heuristic, not validated mastery.
4. **Return to the bridge.** Restore the prior phrase tempo. Two trusted clean bridge takes still reconnect the full phrase. Diagnostic drills cannot master a whole skill. The learner can return earlier; these are supports rather than a forced exam.

The input check does not measure hardware latency. Human picking to clicks mixes reaction/playing delay with system delay. A reliable automatic timing calibration needs a separately validated loopback method with a known acoustic/electrical path. That is not implemented. A passed open-E check also does not prove reliable detection of overlapping strings or other notes.

## Privacy boundary

Audio analysis remains browser-side. Camera requests video only; microphone capture remains in the existing audio path. Camera capture is limited to 640×480 requested resolution, 15 fps, 60 seconds and 32 MiB of accumulated encoded chunks. Browser constraints are requests; the byte cap is independently enforced. If the limit is exceeded, the clip is discarded. Late permission and recorder callbacks cannot recreate a discarded clip. Track loss, backgrounding, page exit and recorder failure release resources. An idle enabled camera remains visible until switched off or the view is hidden/closed.

Video and audio replay are separate; this is not frame-accurate audiovisual alignment or automatic visual analysis. RIFF stores no video in localStorage, IndexedDB, service-worker caches, files or the progress API. A user-controlled operating system, screen recorder or browser feature is outside this application guarantee. Numeric progress is still saved locally and can be explicitly backed up as before.

## Local models before cloud AI

The [browser benchmark](../benchmarks/README.md) runs YIN against Basic Pitch CPU on generated signals. Basic Pitch is isolated from production dependencies. It was slower and produced more false events on these fixtures; this does not establish real-guitar performance. No hosted AI or media uploads were added.

Next candidates are a small monophonic CREPE model for pitch, Basic Pitch with validated guitar thresholds/backends for overlapping notes, and MediaPipe for framing only. Landmarks do not establish fret contact, pressure, tension or a biomechanical cause. Real-guitar evaluation and device benchmarks must precede any production model or cloud proposal. A language model cannot repair unreliable measurements by producing more confident prose.

## Verification and limits

47 TypeScript tests passed; strict type checking and production build passed. Python API: 11 passed, one PostgreSQL integration test skipped without a configured test database. Browser inspection confirmed input/target-note drills, correct string/fret targets and 1/3/5/7 count labels; the local model benchmark completed in Chromium 155. Camera lifetime and race handling were tested with media mocks. No personal camera/microphone recording was made during development.

Outstanding: physical guitar/device tests, true latency calibration, annotated real-guitar benchmarks, actual camera permission/capture on mobile browsers, real peak-memory/battery measurement and synchronized video analysis. The ambiguity thresholds are conservative heuristics and may withhold feedback on genuine extra picking. They must not be described as a trained reliability classifier.
