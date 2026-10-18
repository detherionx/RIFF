# Release verification

## Automated

- TypeScript strict checks and Next.js production build.
- Synthetic audio: low/high guitar pitch, sample rates, silence/noise/DC/clipping, repeated attacks, missed/extra events, timing offset, ringing-mode abstention, relative decay and AudioWorklet flush.
- Curriculum/adaptation: all six stages, original study structure, prerequisite enforcement, confidence gates, tempo progression, transition remediation, interval review, overdue review and malformed/duplicate attempts.
- Interactive theory core: correct natural minor notes and rhythm timing from the actual audio clock.
- Persistence/proxy: nested input validation, bounded request bytes, method/path restrictions and origin checks.
- FastAPI: bearer authentication, account isolation, validation, deletion, rate limits, CORS and readiness.

## Browser checks

Performed in a desktop Chromium-based browser:

- Journey desktop rendering and 390 × 844 phone viewport; no horizontal document overflow.
- Onboarding instrument/experience/goal/time flow and skip-assessment entry.
- Practice reference playback, tablature cue and stop controls.
- Find the Note correct response and persistence.
- E natural minor selection including F-sharp, correct scoring and saved result.

## Acceptance still requiring physical testing

- Real clean electric guitar, acoustic guitar and USB interface; tune all six strings and compare against a trusted tuner.
- Record separated notes accurately, late, with omitted/extra notes, quiet input and noisy rooms. Confirm evidence matches heard performance and uncertain recordings abstain.
- Compare open, light and heavy palm muting without moving microphone or changing gain.
- Camera permission, capture, audio/video synchronization, chosen local video and resource release on iOS Safari and Android Chrome.
- Phone background/foreground interruption, wired/Bluetooth latency and audio-device changes.
- Offline launch after initial load and installation on actual iOS/Android devices.

No physical guitar or device-matrix validation is implied by synthetic tests or viewport emulation.
