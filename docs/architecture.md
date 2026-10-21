# RIFF architecture

RIFF is a local-first guitar practice app. A running API, a cloud account and a paid model are not required for lessons, audio analysis or progress.

## Boundaries

- Next.js / React: onboarding, practice, theory, fretboard, history and settings.
- Web Audio / AudioWorklet: capture, signal analysis and playback in the browser. Microphone access requires HTTPS or localhost.
- TypeScript learning modules: measurable pitch/timing evidence, confidence gating, skill history and deterministic next-exercise selection. The original curriculum is authored material, not an arbitrary-song transcription service.
- Local storage: versioned progress and preferences. A browser reset can remove this data; JSON export provides a portable backup.
- FastAPI + PostgreSQL: optional private progress backup. The browser talks to the same-origin Next.js proxy; the API and database can remain on a private network.

No hosted model is called, and no upload endpoint exists in this release. RIFF must not imply that a language or vision model has watched a performance. Polyphonic transcription, visual technique diagnosis, arbitrary commercial-song ingestion and model-generated curriculum remain future integrations.

## Optional progress API

The frontend contract is `lib/types.ts`; the server validates the matching structure in `server/models.py`. FastAPI publishes its OpenAPI contract at `/openapi.json`.

| Method | API path | Request | Result |
|---|---|---|---|
| POST | `/v1/sessions` | Empty | 201 `{ "token": "<43-character secret>" }` |
| GET | `/v1/progress` | Bearer token | 200 `{ "progress": null }` or saved progress |
| PUT | `/v1/progress` | Bearer token, `{ "progress": <Progress> }` | 200 saved progress |
| DELETE | `/v1/account` | Bearer token | 204, deletes token and progress |
| GET | `/healthz` | None | Process is serving |
| GET | `/readyz` | None | 200 when PostgreSQL is reachable; otherwise 503 |

Only an explicit user action enables backup. The token is a 256-bit random device capability. PostgreSQL stores its SHA-256 digest, never the plaintext. Knowing another account exists cannot reveal its progress. There is no list-accounts API, email identity, password recovery, device pairing or automatic cross-device merge. Losing the token loses access to that backup. Treat exported tokens as credentials; do not publish them or put them in URLs.

PUT replaces the authenticated account's progress atomically. It is last-write-wins; concurrent browser copies can overwrite each other. The current UI is a manual backup/restore workflow. Shared multi-device sync would need revisions and conflict handling before automatic background writes.

Requests are bounded to 1 MiB before parsing, at most 500 attempts, known skills, finite scores, bounded text and valid dates. Unknown fields are rejected. Responses disable caching. Session creation is limited globally to 20 per minute per API process; add shared gateway abuse controls before scaling beyond a small private beta. No request body or bearer-token access logging is enabled in the API container. Hosts may still keep infrastructure logs.

`server/migrations/*.sql` run at API startup, transactionally, under a PostgreSQL advisory lock. Applied filenames are recorded in `riff_migrations`. Add new ordered migrations; do not edit applied migrations. PostgreSQL backups and retention remain an operator responsibility. Deleting an account removes active database data; managed provider backups follow the provider's retention policy.

## Analysis extension seams

1. Keep fast monophonic pitch, onset and timing measurement local. Measurements carry confidence; uncertain input does not earn mastery.
2. Benchmark candidate models in a browser worker before adding them to practice. Keep the production dependency graph independent of benchmark packages. Version evidence and compare against annotated performances, including false positives and abstention.
3. Video stays ephemeral: no recording store, upload route, persistent browser storage or export feature. Stop tracks and discard clips on hidden tabs, page exit, camera off, replacement and failure. The app cannot prevent operating-system swapping or an external screen recorder; the guarantee is about RIFF's own data handling.
4. Cloud AI is not part of the current loop. Only consider optional interpretation of explicitly approved, minimized numeric summaries after local approaches show a measured gap. No raw audio/video transmission or technique inference is authorized by this design.

API lifecycle follows [FastAPI lifespan guidance](https://fastapi.tiangolo.com/advanced/events/); pooled transactions use [Psycopg connection pools](https://www.psycopg.org/psycopg3/docs/advanced/pool.html).
