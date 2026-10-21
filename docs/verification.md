# Release verification

## Katana diagnostic setup — 21 October 2026

55 TypeScript tests, strict type checking and the production build passed after the onset and rhythm-guide fixes. Python API: 11 passed, one local database test skipped; frontend and backend GitHub Actions passed for `aa010fc`. The actual repository includes the diagnostic-coaching changes and explicit device/channel selection. Existing progress storage remains unchanged.

Player feedback exposed ambiguous 6/8 count-in and missing note lengths in beginner drills. Bridges and diagnostic drills now use 4/4, four count-in clicks, matching metronome accents, explicit half/quarter-note lengths and a highlighted PICK/HOLD/REST guide. Original song phrases retain their meter. Browser inspection verified the bridge guide at 55 quarter-note beats/min; the player must still confirm its usability.

Interactive Chromium checks used SECONDARY (KATANA), channel 1, at 44,100 Hz. Quiet baseline, isolated low E, fretted C3, sustained low E and a controlled pulse drill were exercised with the player. These narrow checks exposed and helped correct false onset splits and missed soft attacks. They do not validate every string, overlapping pitches, absolute latency or physical technique. Camera lifecycle has automated coverage, but actual camera hardware remains untested. See [hardware protocol and limits](katana-validation.md).

Deployment was attempted but Railway returned “Deploys have been paused temporarily”. Its official status page reported a build/API outage on 21 October. The public application still runs the previous release; the local preview contains these changes.

## Local diagnostic-coaching change — 19 October 2026

47 TypeScript tests, strict type checking and production build passed. Python API: 11 passed, one database integration test skipped. Chromium inspection verified diagnostic drill controls and note/count targets. The separate Basic Pitch/YIN browser benchmark completed. Camera teardown, size limits and late callbacks were verified with mocks; no personal recording or physical-device validation was performed. These results apply to this local change, not the deployed release. See [audit and remaining acceptance work](diagnostic-coaching.md).

## Automated

18 October 2026: 37 TypeScript tests passed. All 11 Python API tests passed in GitHub Actions against PostgreSQL 18; locally, 10 passed and the database integration test skipped without a local database. Production build passed on Windows and in Railway's Linux container. Live HTTPS smoke checks passed against the deployed PostgreSQL-backed API: authentication, exact backup/restore, account isolation, validation, rejected-write preservation and account deletion. Test accounts were removed.

- TypeScript strict checks and Next.js production build.
- Synthetic audio: low/high guitar pitch, sample rates, silence/noise/DC/clipping, repeated attacks, missed/extra events, timing offset, ringing-mode abstention, relative decay and AudioWorklet flush.
- Curriculum/adaptation: all six stages, original study structure, prerequisite enforcement, confidence gates, tempo progression, transition remediation, interval review, overdue review and malformed/duplicate attempts.
- Interactive theory core: correct natural minor notes, rhythm timing from the actual audio clock, independent review schedules for all five modes, failure reset and overdue selection.
- Persistence/proxy: nested input validation, bounded request bytes, method/path restrictions and origin checks.
- FastAPI: bearer authentication, account isolation, validation, deletion, rate limits, CORS and readiness.

## Browser checks

Performed in a desktop Chromium-based browser:

- Journey desktop rendering and 390 × 844 phone viewport; no horizontal document overflow.
- Onboarding instrument/experience/goal/time flow and skip-assessment entry.
- Practice reference playback, tablature cue and stop controls.
- Find the Note correct response and persistence.
- E natural minor selection including F-sharp, correct scoring and saved result.
- Persisted theory results after a browser reload.
- Public HTTPS application loaded successfully with no development tools required.

## Acceptance still requiring physical testing

- Real clean electric guitar, acoustic guitar and USB interface; tune all six strings and compare against a trusted tuner.
- Record separated notes accurately, late, with omitted/extra notes, quiet input and noisy rooms. Confirm evidence matches heard performance and uncertain recordings abstain.
- Compare open, light and heavy palm muting without moving microphone or changing gain.
- Camera permission, capture, audio/video synchronization, chosen local video and resource release on iOS Safari and Android Chrome.
- Phone background/foreground interruption, wired/Bluetooth latency and audio-device changes.
- Offline launch after initial load and installation on actual iOS/Android devices.

No physical guitar or device-matrix validation is implied by synthetic tests or viewport emulation.
