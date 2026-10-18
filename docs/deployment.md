# Run and deploy RIFF

## Local frontend

Requires Node.js 22 and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Lessons and local progress work without Python, PostgreSQL or any secret. Microphone access works on localhost; another device connecting to a plain HTTP LAN address needs HTTPS instead.

Production checks:

```sh
npm run typecheck
npm test
npm run build
npm start
```

## Full stack with Docker Compose

Requires Docker Engine with Compose. Copy `.env.example` to `.env` and replace `POSTGRES_PASSWORD` with a long random URL-safe secret. Then:

```sh
docker compose up --build -d
docker compose ps
```

Open http://localhost:3000. PostgreSQL persists in the `riff-data` volume. The API is bound to localhost:8000 for development; PostgreSQL is private to Compose. Migrations apply automatically before the API becomes ready. Do not use `docker compose down -v` unless you intend to erase the local database.

The frontend has the server-only `RIFF_API_URL=http://api:8000`. A browser never receives that private address. Backup becomes active only when the user chooses it in Settings. Test with two browser profiles: enable backup separately, save different progress, confirm isolation, then delete one cloud account and confirm the other remains usable.

## Python development and tests

Python 3.13:

```sh
python -m venv server/.venv
```

Windows PowerShell:

```powershell
.\server\.venv\Scripts\python.exe -m pip install -r server/requirements.txt
.\server\.venv\Scripts\python.exe -m pytest server/tests -q
$env:DATABASE_URL = 'postgresql://riff:YOUR_PASSWORD@localhost:5432/riff'
.\server\.venv\Scripts\python.exe -m uvicorn server.main:app --port 8000
```

macOS/Linux:

```sh
server/.venv/bin/python -m pip install -r server/requirements.txt
server/.venv/bin/python -m pytest server/tests -q
DATABASE_URL=postgresql://riff:YOUR_PASSWORD@localhost:5432/riff server/.venv/bin/python -m uvicorn server.main:app --port 8000
```

The manual server commands require an independently accessible PostgreSQL instance; Compose does not publish its database port. For real PostgreSQL integration testing inside the Compose API container:

```sh
docker compose exec api sh -c 'TEST_DATABASE_URL="$DATABASE_URL" python -m pytest server/tests -q'
```

The integration test creates and deletes its own anonymous account, applies migrations and verifies persistence across pool restarts. Without `TEST_DATABASE_URL`, that one test is explicitly skipped; the other API tests exercise authentication, account isolation, deletion, validation, request limits, CORS and readiness with a test double. Use a disposable database for integration tests.

## Railway: two services plus PostgreSQL

Use the repository root as the build context for both services. Railway supports [per-service monorepo configuration](https://docs.railway.com/deployments/monorepo) and [private service networking](https://docs.railway.com/networking/private-networking).

1. Create a Railway project and add PostgreSQL. Enable an appropriate database backup schedule.
2. Add the GitHub repository `detherionx/RIFF` as a service named `api`. In service Build settings choose Dockerfile path `server/Dockerfile`, leaving root directory `/`. In Deploy settings set healthcheck path `/readyz`, timeout 120 seconds, restart policy on failure with at most five retries. Configure these settings directly in Railway; this repository does not rely on deprecated JSON Config as Code files.
3. On `api`, add `DATABASE_URL` as a reference to PostgreSQL's private connection URL (use Railway's variable reference picker). Set `PORT=8000`. Leave `CORS_ORIGINS` empty for the same-origin proxy. Do not generate a public API domain. The API starts as a non-root container, migrates, then serves `/readyz`.
4. Add the same repository as a service named `web`. In service Build settings choose Dockerfile path `Dockerfile`, root directory `/`. Set healthcheck path `/`, timeout 120 seconds, restart policy on failure with at most five retries. Set `PORT=3000`, `RIFF_API_URL=http://api.railway.internal:8000`. This uses Next.js standalone output.
5. Generate a public HTTPS domain for `web`, with target port 3000. Deploy `api` and then `web`. If a trusted public-origin setting is used by the proxy, set it to the exact generated HTTPS origin and redeploy.
6. Open the HTTPS URL on desktop and phone. Complete onboarding, grant microphone permission, record a take, review feedback, reload and verify local history. Enable backup, save, restore, and delete cloud data. Check private API readiness and container logs for migration errors.

Railway's deployment [healthcheck](https://docs.railway.com/deployments/healthchecks) is a deployment gate, not continuous monitoring; configure uptime monitoring separately. Set deployment spend limits appropriate to the beta.

## Operating limits and recovery

- No recordings are uploaded. There is no S3 configuration or hosted AI dependency in this release.
- Cloud backup uses a locally held random capability, not a recoverable email login. Export local progress before clearing browser storage.
- Session creation has a small per-process rate limit. Add gateway abuse controls before a broad public launch.
- Keep PostgreSQL private, rotate database credentials in Railway, and avoid logging request authorization headers.
- If the API is unavailable, local practice remains usable. Restore PostgreSQL from a provider backup if needed; API containers contain no durable data.
- To roll back frontend/API code, redeploy the prior known-good commit. Database migrations are forward-only; take a backup before introducing a destructive migration and provide a tested repair migration.

Deployed on 18 October 2026: [RIFF](https://web-production-61a92.up.railway.app). Both Linux containers built and started on Railway; API readiness confirms database migration and connectivity. HTTPS and live database backup/isolation checks passed. Physical microphone/camera device checks remain in [verification.md](verification.md).

Run the repeatable live check (creates and deletes only its own disposable test accounts):

    node scripts/verify-deployment.mjs https://web-production-61a92.up.railway.app
