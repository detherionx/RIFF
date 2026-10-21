# RIFF

A local-first guitar teacher. Pick a musical destination, practise an original E-minor study, and receive feedback from measured notes and timing.

**[Open RIFF](https://web-production-61a92.up.railway.app)** · [Source repository](https://github.com/detherionx/RIFF)

## Start playing

    npm ci
    npm run dev

Open http://localhost:3000. No API key or account is required. Use headphones and a clean guitar tone. Grant microphone access only when you start the tuner or a take.

## What works

- Two-step onboarding, an optional practical starting assessment, six-stage Song Journey and adaptive Daily Gym.
- Twelve playing exercises, synthesized demonstrations, tablature, fretboard, adjustable metronome, count-in, recording, playback and WAV download.
- Find the Note, Interval Hunter, Build a Scale, Rhythm Lab and Chord Architect, with difficulty, retries and persistent results.
- Browser pitch detection, onset/sequence alignment, missed/extra notes, timing, confidence gates and corrective recommendations.
- Relative palm-muting decay comparison against your own baseline.
- Four-pluck input checks, isolated target-note/pulse drills, and a diagnostic pause after repeated struggles.
- Optional camera capture alongside the take, bounded memory-only silent replay and manual review. No video upload, import or download feature.
- Versioned local progress, JSON import/export and explicit PostgreSQL backup via a private FastAPI service.
- Responsive desktop/phone interface, installable manifest and cached app shell.

The complete original study is **First Light**, eight bars in E minor and 6/8. Tempo controls count eighth-note pulses, explicitly labelled throughout. Commercial song names are aspirations; RIFF contains no commercial recordings or transcriptions.

## Important limits

This is a first beta, not a validated replacement for a human teacher. Scoring is designed for clean **separated monophonic notes**. Ringing arpeggios and full musical performances have a review-only mode because overlapping pitches cannot be graded reliably by this detector. Use the natural performance as your musical goal and separated takes to check accuracy.

Camera feedback is manual. No visual technique model, arbitrary-song decomposition, cloud AI or recording upload is enabled. No recording leaves the browser. Automated tests cover synthetic signal behavior; real guitar/microphone combinations and physical iOS/Android devices still need validation.

Unknown device delay suppresses combined playing scores and mastery changes. Pitch counts and relative pulse consistency remain available. A measured zero is distinct from an unknown delay. A four-pluck check validates simple detection, not hardware latency. See [diagnostic coaching and audit](docs/diagnostic-coaching.md) and the [separate local model benchmark](benchmarks/README.md).

## Verify

    npm run typecheck
    npm test
    npm run build

Python API tests and full-stack setup are in [deployment instructions](docs/deployment.md). Real PostgreSQL integration tests are opt-in and report a skip when no test database is configured.

## Architecture and operation

- [Architecture and API contracts](docs/architecture.md)
- [Curriculum and adaptive rules](docs/curriculum.md)
- [Audio algorithms, contracts and limitations](docs/audio.md)
- [Original reference audio](docs/reference-audio.md) · [Listen](public/first-light.wav)
- [Optional intelligence decisions](docs/intelligence.md)
- [Local setup and Railway deployment](docs/deployment.md)
- [Release verification](docs/verification.md)

Frontend: Next.js / React / TypeScript / Motion / Web Audio. Backend: FastAPI / Psycopg / PostgreSQL. Dockerfiles run as non-root users. Database migrations apply transactionally at startup.

Progress belongs to the browser by default. Clearing browser data removes it. Export a JSON copy or explicitly back up before changing devices. Cloud backup uses a random device capability, not recoverable email sign-in.
