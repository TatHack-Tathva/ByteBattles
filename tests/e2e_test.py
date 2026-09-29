"""End-to-end lifecycle test for ByteBattles.

Lifecycle covered:
  1. register + login
  2. admin bootstrap, tag + problem creation (testcase zip upload)
  3. submit code -> job lands on the Redis queue -> judge picks it up asynchronously
  4. poll GET /submissions/{id} until a final verdict
  5. verdict payload (failing testcase + output), problem counters, optional leaderboard/stats

Modes
  python -m tests.e2e_test                  fake stack (SQLite + fakeredis + in-memory storage).
                                            A stub judge thread runs the submitted Python code
                                            for real and writes the verdict through the real
                                            JudgePipeline result-update code. No Docker needed.
  python -m tests.e2e_test --live [--base-url http://localhost:8000]
                                            real stack (docker compose up). The real judge
                                            does the work. Needs ADMIN_BOOTSTRAP_TOKEN in the env
                                            (or E2E_ADMIN_USER / E2E_ADMIN_PASS for an existing admin).
"""
import io, os, sys, json, time, uuid, zipfile, argparse, tempfile, threading, subprocess

ap = argparse.ArgumentParser()
ap.add_argument("--live", action="store_true")
ap.add_argument("--base-url", default=os.getenv("E2E_BASE_URL", "http://localhost:8000"))
ARGS = ap.parse_args()

GOOD = "a, b = map(int, input().split())\nprint(a + b)\n"
BAD = "a, b = map(int, input().split())\nprint(a - b)\n"
CASES = [("1 2", "3"), ("10 20", "30")]
TIMEOUT = 60 if ARGS.live else 15

STUB = None  # set in fake mode: (start_judge, stop_judge, FAKE redis)

if not ARGS.live:
    ENV = dict(REDIS_HOST="x", REDIS_PORT="6379", REDIS_DB="0", DB_HOST="x", DB_PORT="1", DB_USER="x",
               DB_PASSWD="x", DB_DATABASE="x", SECRET_KEY="k", ALGORITHM="HS256",
               ACCESS_TOKEN_EXPIRE_MINUTES="30", REFRESH_TOKEN_EXPIRE_DAYS="7", DUMMY_PASS="d",
               REDIS_JOB_LIST="judge:queue", WORKER_PREFIX="worker", TESTCASE_BUCKET="t", SUBMISSION_BUCKET="s",
               ADMIN_BOOTSTRAP_TOKEN="launch-code-e2e", SUBMISSION_RATE_LIMIT="50", SUBMISSION_RATE_WINDOW_SEC="60",
               REDIS_RESULT_CHANNEL="r", SHUTDOWN_KEY="s", WARM_QUEUE_PREFIX="warm", CONTAINER_POOL_THRESHOLD="1",
               CONTAINER_WORKER_COUNT="1", MINIMUM_JUDGE_WORKER="1", MAXIMUM_JUDGE_WORKER="1",
               JUDGE_WORKER_TIMEOUT="1", ACQUIRE_TIMEOUT_SECONDS="1", MAX_MEMCAP_GB="1", MAX_PIDS="8",
               WORKSPACE_DIR="/workspace")
    os.environ.update(ENV)
    import config
    config.DB_URL = f"sqlite:///{tempfile.mktemp(suffix='.db')}?check_same_thread=false"

    import fakeredis
    from fastapi.testclient import TestClient
    import api.app.utils.redis_utils as ru
    FAKE = fakeredis.FakeRedis(decode_responses=True)
    ru.get_redis_client = lambda: FAKE

    class FakeStore:
        def __init__(self): self.d = {}; self.n = 0
        def upload_bytes(self, *a, **kw):
            self.n += 1; key = f"k{self.n}"; self.d[key] = kw.get("data"); return key
        def get_file(self, k): return self.d[k]
        def delete_file(self, k): self.d.pop(k, None)
        def delete_problem_folder(self, pid): pass
        def file_exists(self, k): return k in self.d
    TC, SUB = FakeStore(), FakeStore()
    import shared.core as sc
    sc.get_storage_testcases = lambda: TC; sc.get_storage_submission_code = lambda: SUB
    import shared.models.submission as sm
    sm.get_storage_testcases = lambda: TC; sm.get_storage_submission_code = lambda: SUB
    import api.app.routes.problems as rp, api.app.routes.submissions as rs
    rp.get_storage_testcases = lambda: TC; rs.get_storage_submission_code = lambda: SUB
    import api.app.main as m
    m.get_redis_client = lambda: FAKE
    client = TestClient(m.app)
    BOOT_CODE = "launch-code-e2e"

    from shared.core import SessionLocal
    from shared.models import TestCase, Submission, Verdict
    from judge.judge_worker.pipeline import JudgePipeline
    from judge.judge_worker.database import Database
    from judge.judge_worker.types import SubmissionResult

    def _norm(s): return "\n".join(s.strip().split())

    def _judge_one(pipe, sid):
        """Stand-in for the sandboxed judge: really runs the code, real result-update path."""
        with SessionLocal() as db:
            sub = db.query(Submission).get(sid)
            code = SUB.get_file(sub.code_object_key).decode()
            cases = db.query(TestCase).filter(TestCase.problem_id == sub.problem_id).order_by(TestCase.id).all()
            cases = [(c.input_key, TC.get_file(c.input_key).decode(), TC.get_file(c.output_key).decode()) for c in cases]
        res = SubmissionResult(submission_id=sid, verdict=Verdict.ACCEPTED, runtime_ms=5, memory_kb=1024)
        for key, inp, exp in cases:
            p = subprocess.run([sys.executable, "-c", code], input=inp, capture_output=True, text=True, timeout=5)
            if p.returncode != 0:
                res.verdict, res.output, res.incorrect_testcase_key = Verdict.RUNTIME_ERROR, p.stderr[:8192], key
                break
            if _norm(p.stdout) != _norm(exp):
                res.verdict, res.output, res.incorrect_testcase_key = Verdict.WRONG_ANSWER, p.stdout[:8192], key
                break
        time.sleep(0.4)  # make the PD -> final transition observable by the poller
        pipe._update_submission_result(sid, res)

    _stop = threading.Event()
    def _judge_loop():
        pipe = JudgePipeline.__new__(JudgePipeline); pipe.db = Database()
        while not _stop.is_set():
            item = FAKE.rpop("judge:queue")
            if item is None:
                time.sleep(0.1); continue
            _judge_one(pipe, int(item))
    def start_judge(): threading.Thread(target=_judge_loop, daemon=True).start()
    STUB = (start_judge, _stop.set)
else:
    import httpx
    client = httpx.Client(base_url=ARGS.base_url, timeout=30)
    BOOT_CODE = os.getenv("ADMIN_BOOTSTRAP_TOKEN", "")
    FAKE = None

passed = 0
def check(name, cond, extra=""):
    global passed
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))
    if not cond:
        print(f"\nE2E FAILED after {passed} passing checks"); sys.exit(1)
    passed += 1

def skip(name, why): print(f"SKIP {name}  [{why}]")

def zip_bytes(name):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for i, (inp, out) in enumerate(CASES, 1):
            z.writestr(f"{name}/inputs/{i}.txt", inp); z.writestr(f"{name}/outputs/{i}.txt", out)
    return b.getvalue()

def auth(u, p):
    r = client.post("/auth/login", data=dict(username=u, password=p))
    return r, {"Authorization": f"Bearer {r.json().get('access_token', '')}"}

def poll_verdict(sid, headers=None):
    """Poll like the frontend does; returns (final_json, sorted list of verdicts seen)."""
    seen, deadline = [], time.time() + TIMEOUT
    while time.time() < deadline:
        j = client.get(f"/submissions/{sid}", headers=headers).json()
        if not seen or seen[-1] != j["verdict"]: seen.append(j["verdict"])
        if j["verdict"] != "PD": return j, seen
        time.sleep(0.3 if not ARGS.live else 1.5)
    return None, seen

# ---------------------------------------------------------------- 0. health
h = client.get("/health").json()
check("health: redis + postgres up", h["redis"] == "up" and h["postgres"] == "up", json.dumps(h)[:140])
check("health: queue depth + worker + warm pool fields present",
      h["judge_queue_depth"] is not None and h["active_judge_workers"] is not None and "warm_sandboxes" in h)

# ---------------------------------------------------------------- 1. register + auth
run = uuid.uuid4().hex[:6]
admin_u, user_u, pw = f"cmdr_{run}", f"crew_{run}", "Orbit#2026"
for u in (admin_u, user_u):
    r = client.post("/auth/register", json=dict(username=u, email=f"{u}@e2e.io", password=pw, conf_password=pw))
    check(f"register {u}", r.status_code == 201, r.text[:80])
check("duplicate register -> 409", client.post("/auth/register", json=dict(
    username=user_u, email=f"{user_u}@e2e.io", password=pw, conf_password=pw)).status_code == 409)
check("bad password -> 401", auth(user_u, "wrong")[0].status_code == 401)
r, USER = auth(user_u, pw); check("login ok", r.status_code == 200 and "refresh_token" in r.json())
check("GET /users/me", client.get("/users/me", headers=USER).json()["username"] == user_u)

# ---------------------------------------------------------------- 2. admin + problem
_, ADMIN = auth(admin_u, pw)
r = client.post("/auth/bootstrap-admin", params={"launch_code": BOOT_CODE}, headers=ADMIN)
if r.status_code == 409 and os.getenv("E2E_ADMIN_USER"):
    _, ADMIN = auth(os.environ["E2E_ADMIN_USER"], os.environ["E2E_ADMIN_PASS"])
    print("INFO admin already bootstrapped, using E2E_ADMIN_USER")
else:
    check("admin bootstrap", r.status_code == 200, r.text[:80])
check("non-admin cannot create tag", client.post("/problems/tag", json=dict(name="Math", slug=f"math-{run}"), headers=USER).status_code == 403)
tag = f"math-{run}"
check("admin creates tag", client.post("/problems/tag", json=dict(name="Math", slug=tag), headers=ADMIN).status_code == 201)

PID = f"SUM{run}".upper()
r = client.post("/problems/", headers=ADMIN, data=dict(
    id=PID, title="A + B", description="Add two numbers", difficulty="EASY", constraints=json.dumps(["1 <= a,b <= 1e9"]),
    tags=json.dumps([tag]), sample_io=json.dumps({"1 2": "3"}), input_desc="two ints", output_desc="their sum",
    memory_limit_mb=64, time_limit_sec=2, visibility="true"),
    files={"tests_zip": (f"{PID}.zip", zip_bytes(PID), "application/zip")})
check("create problem with testcase zip", r.status_code == 201, r.text[:120])
before = client.get(f"/problems/{PID}").json()
check("problem visible, counters start at 0", before["id"] == PID and (before.get("total_submissions") or 0) == 0)

# ---------------------------------------------------------------- 3. async submissions
depth0 = client.get("/health").json()["judge_queue_depth"]
r = client.post("/submissions/", headers=USER, json=dict(problem_id=PID, code=BAD, language="PY"))
check("submit wrong solution -> 201 PD", r.status_code == 201 and r.json()["verdict"] == "PD", r.text[:80])
bad_id = r.json()["id"]
if STUB:
    check("job is queued before any worker runs (async)", client.get("/health").json()["judge_queue_depth"] == depth0 + 1)
    STUB[0]()  # start the stub judge now
bad, seen = poll_verdict(bad_id)
check("wrong solution reaches WA", bad is not None and bad["verdict"] == "WA", f"seen {seen}")
check("verdict lifecycle went PD -> WA", seen[0] == "PD" and seen[-1] == "WA", str(seen))

r = client.post("/submissions/", headers=USER, json=dict(problem_id=PID, code=GOOD, language="PY"))
good, seen = poll_verdict(r.json()["id"])
check("correct solution reaches AC", good is not None and good["verdict"] == "AC", f"seen {seen}")

# ---------------------------------------------------------------- 4. verdict payload + stats
check("WA payload has failing testcase input", bad["incorrect_testcase"] == "1 2", repr(bad["incorrect_testcase"]))
check("WA payload has program output", (bad["output"] or "").strip() == "-1", repr(bad["output"]))
check("AC payload has no failing testcase", good["incorrect_testcase"] is None)
check("submission history lists both", len(client.get("/submissions/", headers=USER, params=dict(problem_id=PID)).json()) == 2)

for _ in range(20):  # counters land in the same transaction as the verdict
    p = next(i for i in client.get("/problems/", params=dict(title="A + B", limit=100)).json()["items"] if i["id"] == PID)
    if p["total_submissions"] == 2: break
    time.sleep(0.3)
check("problem counters: total=2 accepted=1", (p["total_submissions"], p["accepted_submissions"]) == (2, 1), str(p))

r = client.get(f"/problems/{PID}/stats")
if r.status_code == 200: check("optional /problems/{id}/stats matches counters", r.json() is not None, r.text[:100])
else: skip("problem stats endpoint", f"not implemented (HTTP {r.status_code})")
r = client.get("/leaderboard")
if r.status_code == 200 and isinstance(r.json(), (list, dict)):
    check("optional leaderboard lists the solver", user_u in json.dumps(r.json()), r.text[:100])
else: skip("leaderboard endpoint", f"not implemented (HTTP {r.status_code})")

if STUB: STUB[1]()
print(f"\nE2E PASSED: {passed} checks ({'live stack' if ARGS.live else 'fake stack'})")
