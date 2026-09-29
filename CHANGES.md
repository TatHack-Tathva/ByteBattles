# ByteBattles: what changed

## Bugs fixed
| # | Where | Problem | Fix |
|---|-------|---------|-----|
| 1 | `api/app/utils/oauth2.py` | Refresh tokens were issued with the *access* lifetime (`minutes=ACCESS_TOKEN_EXPIRE_MINUTES`) | Now `timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)` |
| 2 | `api/app/routes/problems.py` | `offset = page * limit` skipped the whole first page | `(page - 1) * limit` |
| 3 | `problems.py`, `submissions.py` | `limit` had `ge=5`, so `limit=1..4` was rejected | `ge=1` |
| 4 | `api/app/routes/problems.py` | `POST /problems/tag` (admin) had been removed | Rebuilt with 409 on duplicate slug, plus `GET /problems/tags` |

## Features
1. **Submission counters** (`judge/judge_worker/pipeline.py`): atomic SQL increments in the same transaction as the verdict. Counted only on the PENDING to final transition, so worker retries never double-count.
2. **Admin bootstrap / promotion**: `POST /auth/bootstrap-admin` (needs `ADMIN_BOOTSTRAP_TOKEN`, only works while zero admins exist, constant-time compare, Postgres advisory lock against races); `POST /users/{u}/promote` and `/demote` (admin only, no self-demote).
3. **PATCH /problems/{id}**: partial update of metadata, tags, visibility; optional `tests_zip` swaps testcases (new objects uploaded first, old ones deleted only after DB commit; rollback cleans up).
4. **Rate limiting**: Redis atomic fixed window per user on `POST /submissions/`; 429 with `Retry-After`, `X-RateLimit-*` headers; configurable via `SUBMISSION_RATE_LIMIT` / `SUBMISSION_RATE_WINDOW_SEC`.
5. **Search & filter** on `GET /problems/`: `title` (case-insensitive, wildcard-safe), `difficulty`, `tag`; response is `{items, total, page, limit, has_more}`.
6. **4th language: JavaScript (Node.js 20)**: `judge/images/node/Dockerfile`, enum/maps in `shared/models`, executor and pipeline branches, auto-picked-up by the sandbox pool. Sandbox isolation flags untouched. Startup adds the new value to the Postgres ENUM on existing databases.
7. **Telemetry**: `cosmo_polo_telemetry()` and `GET /health`.

## Deploy notes
- Rebuild sandbox images: `cd judge/images && bash build_command.sh`
- Add `ADMIN_BOOTSTRAP_TOKEN` to `.env` (see `.env.example`), register a user, log in, then call `/auth/bootstrap-admin`.
- `GET /problems/` now returns an object instead of a bare list (needed for pagination metadata).

## Tests
`python -m tests.smoke_test` runs 32 end-to-end checks (SQLite + fakeredis + in-memory storage). It does not need Docker.
# Phase 3: telemetry, verdict UX, E2E test

## Changes in this phase
| Where | Change |
|-------|--------|
| `shared/models/submission.py` | **Bug fix:** `incorrect_testcase` checked the *submission* bucket for a testcase key, so it always returned `None`. It now reads from the testcase bucket and returns text. Without this the UI could never show the failing input. |
| `api/app/utils/telemetry.py` | `GET /health` also returns `warm_sandboxes` (warm container count per language) |
| `api/app/schemas/user.py` | `GET /users/me` now returns `user_type` (`USER` / `ADMIN`) so the UI can hide admin-only screens |
| `tests/dev_server.py` | Docker-free dev backend: fake stack + stub judge (runs Python for real) + CORS + demo data (`python -m tests.dev_server`) |
| `frontend/` | Polished UI, see below |

### Frontend refinements
- **Auth:** register page with live validation mirroring backend rules; login with show/hide password; automatic access-token refresh on 401 (concurrent requests share one refresh, expired sessions return to login); navbar shows the username and hides Admin for non-admins; non-admins see a "claim admin" card that uses the bootstrap launch code.
- **Dashboard:** skeleton loading, difficulty badges, tag chips, acceptance-rate bars, staggered entrance, empty and error states with retry, stale-search protection.
- **Problem page:** Ctrl/Cmd+Enter submits, reset-to-starter, safe per-language drafts, "not found" state, recent-submission history (click to reopen a past verdict) that refreshes when a verdict lands.
- **Verdict UX:** spinner, elapsed timer and indeterminate bar while judging; pop-in verdict, animated tick and green glow on AC; failing input beside the program output on WA/RE/TLE; error log on CE/RE; polling survives network blips.
- **Status page (`/status`):** stat cards, warm-pool depth, live ping sparkline, green/amber/red state.
- **Robustness and polish:** error boundary, readable FastAPI validation errors, tolerates corrupted token storage, `prefers-reduced-motion` respected, visible focus rings, responsive layouts.

**Verdict view limit:** the API stores the failing testcase *input* and the program's *output* but not the expected output, so the UI shows those two blocks side by side, not a true diff. A real diff needs the judge to also store expected output (`SubmissionResult` / `Submission`).

## API routes
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/auth/register` | none | 409 on duplicate username/email |
| POST | `/auth/login` | none | form data; returns access + refresh token |
| POST | `/auth/refresh` | none | JSON `{refresh_token}` |
| POST | `/auth/bootstrap-admin?launch_code=` | user | works only while no admin exists |
| GET / PATCH / DELETE | `/users/me` | user | |
| GET | `/users/{username}` | none | |
| POST | `/users/{username}/promote`, `/demote` | admin | no self-demote |
| GET | `/problems/` | none | filters `title`, `difficulty`, `tag`; `page`, `limit`; returns `{items,total,page,limit,has_more}` |
| GET | `/problems/{id}` | none | |
| POST | `/problems/` | admin | multipart form + `tests_zip` (zip name must equal its top folder) |
| PATCH | `/problems/{id}` | admin | partial update; optional `tests_zip` |
| DELETE | `/problems/` | admin | |
| POST / GET | `/problems/tag`, `/problems/tags` | admin / none | |
| POST | `/submissions/` | user | rate limited, enqueues job |
| GET | `/submissions/` | optional | `problem_id`, `username`, `page`, `limit` |
| GET | `/submissions/{id}` | none | verdict, output, failing testcase, time, memory, code |
| GET | `/health` | none | Redis/Postgres status, queue depth, workers, warm pool |

## Environment variables (`.env.example`)
- **Redis / Postgres / MinIO:** `REDIS_HOST/PORT/DB`, `DB_HOST/PORT/USER/PASSWD/DATABASE`, `S3_ENDPOINT_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_SIGNATURE_VERSION`
- **Auth:** `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`, `DUMMY_PASS`
- **Buckets:** `TESTCASE_BUCKET`, `SUBMISSION_BUCKET`
- **Judge:** `MINIMUM_JUDGE_WORKER`, `MAXIMUM_JUDGE_WORKER`, `JUDGE_WORKER_TIMEOUT`, `CONTAINER_POOL_THRESHOLD`, `CONTAINER_WORKER_COUNT`, `ACQUIRE_TIMEOUT_SECONDS`, `MAX_MEMCAP_GB`, `MAX_PIDS`, `WORKSPACE_DIR`
- **Redis keys:** `REDIS_JOB_LIST`, `REDIS_RESULT_CHANNEL`, `SHUTDOWN_KEY`, `WORKER_PREFIX`, `WARM_QUEUE_PREFIX`
- **Extensions:** `ADMIN_BOOTSTRAP_TOKEN` (empty disables bootstrap), `SUBMISSION_RATE_LIMIT`, `SUBMISSION_RATE_WINDOW_SEC`
- **Frontend (`frontend/.env`):** `VITE_API_URL` (default `http://localhost:8000`)

## Setup
1. `cp .env.example .env` and set `ADMIN_BOOTSTRAP_TOKEN` to a long random value.
2. Build sandbox images: `cd judge/images && bash build_command.sh`
3. Start everything: `docker compose up --build` (API on :8000, docs at `/docs`).
4. Register a user, log in, then `POST /auth/bootstrap-admin?launch_code=<token>` to become admin.
5. Frontend: `cd frontend && cp .env.example .env && npm install && npm run dev` (http://localhost:5173). The API must allow the frontend origin via `CORS_ORIGINS`.
6. No Docker? `python -m tests.dev_server` serves a seeded demo API on :8000 (logins `commander` / `alice`, password `Orbit#2026`, launch code `dev-launch-code`).

## Tests
- `python -m tests.smoke_test` – 32 API checks, no Docker.
- `python -m tests.e2e_test` – 23 lifecycle checks on the fake stack; a stub judge runs the submitted Python for real.
- `cd frontend && npm test` – 14 checks: token refresh logic, verdict panel states, and (when an API is up on :8000) the full register, login, submit, verdict flow through the real frontend services plus CORS.
- `python -m tests.e2e_test --live` – same lifecycle against `docker compose up` with the real judge (`ADMIN_BOOTSTRAP_TOKEN` in env; if an admin already exists set `E2E_ADMIN_USER` / `E2E_ADMIN_PASS`). Leaderboard and stats checks are skipped when those endpoints don't exist.

## Deployment
- Set strong `SECRET_KEY`, DB and MinIO credentials; don't ship the `.env.example` defaults.
- The judge container mounts `/var/run/docker.sock`, so run it on a dedicated host.
- Scale judging with `MINIMUM/MAXIMUM_JUDGE_WORKER`; watch `/health` for backlog and warm pool depth.
- Rebuild sandbox images after Dockerfile changes; put the API behind HTTPS and restrict CORS to your frontend origin.
- Build the frontend with `npm run build` (set `VITE_API_URL` first) and serve `frontend/dist` from any static host.
