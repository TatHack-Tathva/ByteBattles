"""Docker-free dev backend for the frontend: fake stack + stub judge + CORS + demo data.

Run:  python -m tests.dev_server            (API on http://localhost:8000)
Demo logins: commander / Orbit#2026 (admin), alice / Orbit#2026
The stub judge really runs submitted *Python*; other languages come back as RE.
"""
import io, os, sys, time, json, zipfile, tempfile, threading, subprocess

os.environ.update(REDIS_HOST="x", REDIS_PORT="6379", REDIS_DB="0", DB_HOST="x", DB_PORT="1", DB_USER="x", DB_PASSWD="x",
    DB_DATABASE="x", SECRET_KEY="dev", ALGORITHM="HS256", ACCESS_TOKEN_EXPIRE_MINUTES=os.getenv("DEV_ACCESS_MIN", "30"),
    REFRESH_TOKEN_EXPIRE_DAYS="7", DUMMY_PASS="d", REDIS_JOB_LIST="judge:queue", WORKER_PREFIX="worker",
    TESTCASE_BUCKET="t", SUBMISSION_BUCKET="s", ADMIN_BOOTSTRAP_TOKEN="dev-launch-code", SUBMISSION_RATE_LIMIT="100",
    SUBMISSION_RATE_WINDOW_SEC="60", REDIS_RESULT_CHANNEL="r", SHUTDOWN_KEY="s", WARM_QUEUE_PREFIX="warm",
    CONTAINER_POOL_THRESHOLD="1", CONTAINER_WORKER_COUNT="1", MINIMUM_JUDGE_WORKER="1", MAXIMUM_JUDGE_WORKER="1",
    JUDGE_WORKER_TIMEOUT="1", ACQUIRE_TIMEOUT_SECONDS="1", MAX_MEMCAP_GB="1", MAX_PIDS="8", WORKSPACE_DIR="/workspace")
import config
config.DB_URL = f"sqlite:///{tempfile.mktemp(suffix='.db')}?check_same_thread=false"

import fakeredis, uvicorn
from fastapi.testclient import TestClient
from fastapi.middleware.cors import CORSMiddleware
import api.app.utils.redis_utils as ru
FAKE = fakeredis.FakeRedis(decode_responses=True)
ru.get_redis_client = lambda: FAKE

class Store:
    def __init__(self): self.d = {}; self.n = 0
    def upload_bytes(self, *a, **kw): self.n += 1; k = f"k{self.n}"; self.d[k] = kw.get("data"); return k
    def get_file(self, k): return self.d[k]
    def delete_file(self, k): self.d.pop(k, None)
    def delete_problem_folder(self, pid): pass
    def file_exists(self, k): return k in self.d
TC, SUB = Store(), Store()
import shared.core as sc; sc.get_storage_testcases = lambda: TC; sc.get_storage_submission_code = lambda: SUB
import shared.models.submission as sm; sm.get_storage_testcases = lambda: TC; sm.get_storage_submission_code = lambda: SUB
import api.app.routes.problems as rp, api.app.routes.submissions as rs
rp.get_storage_testcases = lambda: TC; rs.get_storage_submission_code = lambda: SUB
import api.app.main as m
m.get_redis_client = lambda: FAKE
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
m.app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"], allow_credentials=True)

from shared.core import SessionLocal
from shared.models import TestCase, Submission, Verdict
from judge.judge_worker.pipeline import JudgePipeline
from judge.judge_worker.database import Database
from judge.judge_worker.types import SubmissionResult

def _norm(s): return "\n".join(s.strip().split())
def judge_one(pipe, sid):
    with SessionLocal() as db:
        sub = db.get(Submission, sid); lang = sub.language.value; code = SUB.get_file(sub.code_object_key).decode()
        cases = db.query(TestCase).filter(TestCase.problem_id == sub.problem_id).order_by(TestCase.id).all()
        cases = [(c.input_key, TC.get_file(c.input_key).decode(), TC.get_file(c.output_key).decode()) for c in cases]
    time.sleep(1.2)  # let the UI show the "judging" state
    res = SubmissionResult(submission_id=sid, verdict=Verdict.ACCEPTED, runtime_ms=12, memory_kb=9216)
    if lang != "PY":
        res.verdict, res.output = Verdict.RUNTIME_ERROR, "Dev stub judge only runs Python."
    else:
        for key, inp, exp in cases:
            try:
                p = subprocess.run([sys.executable, "-c", code], input=inp, capture_output=True, text=True, timeout=2)
            except subprocess.TimeoutExpired:
                res.verdict, res.output, res.incorrect_testcase_key = Verdict.TIME_LIMIT_EXCEEDED, "", key; break
            if p.returncode != 0:
                res.verdict, res.output, res.incorrect_testcase_key = Verdict.RUNTIME_ERROR, p.stderr[-2000:], key; break
            if _norm(p.stdout) != _norm(exp):
                res.verdict, res.output, res.incorrect_testcase_key = Verdict.WRONG_ANSWER, p.stdout[:8192], key; break
    pipe._update_submission_result(sid, res)

def judge_loop():
    pipe = JudgePipeline.__new__(JudgePipeline); pipe.db = Database()
    while True:
        FAKE.set("worker:dev:heartbeat", time.time())  # shows up as an active worker in /health
        for k in ("C", "CPP", "PY", "JS"): 
            if FAKE.llen(f"warm:{k}") == 0: FAKE.lpush(f"warm:{k}", "dev")
        item = FAKE.rpop("judge:queue")
        if item is None: time.sleep(0.2); continue
        try: judge_one(pipe, int(item))
        except Exception as e: print("judge error", e)

def seed():
    c = TestClient(m.app); pw = "Orbit#2026"
    for u in ("commander", "alice"):
        c.post("/auth/register", json=dict(username=u, email=f"{u}@x.io", password=pw, conf_password=pw))
    tok = c.post("/auth/login", data=dict(username="commander", password=pw)).json()["access_token"]
    H = {"Authorization": f"Bearer {tok}"}
    c.post("/auth/bootstrap-admin", params={"launch_code": "dev-launch-code"}, headers=H)
    for n, s in (("Math", "math"), ("Strings", "strings"), ("Arrays", "arrays")): c.post("/problems/tag", json=dict(name=n, slug=s), headers=H)
    probs = [("SUM01", "A + B", "EASY", "math", "Read two integers and print their sum.", [("1 2", "3"), ("10 20", "30")]),
             ("REV02", "Reverse Words", "MEDIUM", "strings", "Print the words of the line in reverse order.", [("a b c", "c b a"), ("hi there", "there hi")]),
             ("MAX03", "Array Maximum", "HARD", "arrays", "First line n, second line n integers. Print the maximum.", [("3\n1 5 2", "5"), ("2\n-4 -9", "-4")])]
    for pid, title, diff, tag, desc, cases in probs:
        b = io.BytesIO()
        with zipfile.ZipFile(b, "w") as z:
            for i, (a, o) in enumerate(cases, 1): z.writestr(f"{pid}/inputs/{i}.txt", a); z.writestr(f"{pid}/outputs/{i}.txt", o)
        r = c.post("/problems/", headers=H, data=dict(id=pid, title=title, description=desc, difficulty=diff, constraints=json.dumps(["1 <= n <= 1000"]),
            tags=json.dumps([tag]), sample_io=json.dumps({"1": cases[0][0] + "\n->\n" + cases[0][1]}), input_desc="See statement", output_desc="One line",
            memory_limit_mb=64, time_limit_sec=2, visibility="true"), files={"tests_zip": (f"{pid}.zip", b.getvalue(), "application/zip")})
        assert r.status_code == 201, r.text

if __name__ == "__main__":
    seed(); threading.Thread(target=judge_loop, daemon=True).start()
    print("Dev API ready: http://localhost:8000  | logins: commander / alice, password Orbit#2026 | bootstrap code: dev-launch-code")
    uvicorn.run(m.app, host="127.0.0.1", port=8000, log_level="warning")
