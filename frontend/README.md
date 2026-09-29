# ByteBattles frontend (React 19, TypeScript, Vite, Tailwind v4)

```bash
cd frontend
cp .env.example .env      # VITE_API_URL points at the backend
npm install
npm run dev               # http://localhost:5173
```

Backend must be running (`docker compose up`) with `http://localhost:5173` in `CORS_ORIGINS` (already the default).
Log in with any registered user (for example the ones from `python -m scripts.seed`, like `alice` / `Orbit#2026`).
Success looks like: redirect to the dashboard and a green "Backend link verified" banner.

Folders: `components/` reusable UI, `pages/` routed screens, `hooks/` state (auth), `services/` API calls.
Tokens are kept in `localStorage` for now (fine for a scaffold; move to httpOnly cookies before production).

## Editor, submissions and admin
- `/problems/:id`: Monaco editor (auto-closing brackets and quotes, highlighting for Python, C, C++, JS), submit button, live verdict polling of `GET /submissions/{id}` every 1.5s until final.
- `/admin`: create problems (with testcase zip), manage/delete problems, manage tags. Needs an admin account (`POST /auth/bootstrap-admin`).
- Monaco loads its files from a CDN at runtime, so the browser needs internet access.

## Try it without Docker
```
python -m tests.dev_server        # repo root: seeded API on :8000 (commander / alice, Orbit#2026)
cd frontend && npm install && npm run dev
npm test                          # unit tests; live tests run automatically if the API is up
```
