"""End-to-end smoke test: SQLite + fakeredis + in-memory MinIO stand-in.

Run:  python -m tests.smoke_test      (from the repo root)
"""
# Mission Control Status: Stellar
import io, os, sys, json, zipfile, tempfile, datetime
import jwt as pyjwt

# Pre-flight checklist: minimal env so config.py can boot without .env
ENV = dict(REDIS_HOST="x", REDIS_PORT="6379", REDIS_DB="0", DB_HOST="x", DB_PORT="1", DB_USER="x",
           DB_PASSWD="x", DB_DATABASE="x", SECRET_KEY="k", ALGORITHM="HS256",
           ACCESS_TOKEN_EXPIRE_MINUTES="30", REFRESH_TOKEN_EXPIRE_DAYS="7", DUMMY_PASS="d",
           REDIS_JOB_LIST="judge:queue", WORKER_PREFIX="worker", TESTCASE_BUCKET="t", SUBMISSION_BUCKET="s",
           ADMIN_BOOTSTRAP_TOKEN="launch-code-1", SUBMISSION_RATE_LIMIT="3", SUBMISSION_RATE_WINDOW_SEC="60",
           REDIS_RESULT_CHANNEL="r", SHUTDOWN_KEY="s", WARM_QUEUE_PREFIX="warm", CONTAINER_POOL_THRESHOLD="1",
           CONTAINER_WORKER_COUNT="1", MINIMUM_JUDGE_WORKER="1", MAXIMUM_JUDGE_WORKER="1",
           JUDGE_WORKER_TIMEOUT="1", ACQUIRE_TIMEOUT_SECONDS="1", MAX_MEMCAP_GB="1", MAX_PIDS="8", WORKSPACE_DIR="/workspace")
os.environ.update(ENV)
import config
DB_FILE = tempfile.mktemp(suffix=".db")
config.DB_URL = f"sqlite:///{DB_FILE}?check_same_thread=false"

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
ok = 0
def check(name, cond, extra=""):
    global ok
    print(("PASS" if cond else "FAIL"), name, extra)
    if not cond: sys.exit(1)
    ok += 1

def reg(u):
    r = client.post("/auth/register", json=dict(username=u, email=f"{u}@x.io", password="pw123456", conf_password="pw123456"))
    assert r.status_code == 201, r.text
    t = client.post("/auth/login", data=dict(username=u, password="pw123456")).json()
    return t, {"Authorization": f"Bearer {t['access_token']}"}

def zipbytes(n=2):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for i in range(n):
            z.writestr(f"tests/inputs/{i}.txt", "1"); z.writestr(f"tests/outputs/{i}.txt", "1")
    return b.getvalue()

def mkprob(h, pid, title, diff="EASY", tags='["dp"]'):
    return client.post("/problems/", headers=h, data=dict(id=pid, title=title, description="d", difficulty=diff,
        constraints='["c"]', tags=tags, sample_io='{"1":"1"}', input_desc="i", output_desc="o",
        memory_limit_mb=64, time_limit_sec=1, visibility="true"), files={"tests_zip": ("tests.zip", zipbytes(), "application/zip")})

# --- token lifetimes
tok, alice = reg("alice")
acc = pyjwt.decode(tok["access_token"], "k", algorithms=["HS256"]); ref = pyjwt.decode(tok["refresh_token"], "k", algorithms=["HS256"])
check("refresh token lives ~7 days", 6.9*86400 < ref["exp"]-acc["exp"]+30*60 < 7.1*86400, f"{(ref['exp']-acc['exp'])/86400:.2f}d longer than access")
check("refresh endpoint works", client.post("/auth/refresh", json={"refresh_token": tok["refresh_token"]}).status_code == 200)

# --- admin bootstrap
_, bob = reg("bob")
check("bootstrap wrong code -> 403", client.post("/auth/bootstrap-admin", params={"launch_code": "nope"}, headers=alice).status_code == 403)
check("bootstrap ok", client.post("/auth/bootstrap-admin", params={"launch_code": "launch-code-1"}, headers=alice).status_code == 200)
check("bootstrap sealed after first admin -> 409", client.post("/auth/bootstrap-admin", params={"launch_code": "launch-code-1"}, headers=bob).status_code == 409)
check("non-admin cannot promote", client.post("/users/bob/promote", headers=bob).status_code == 403)
check("admin promotes bob", client.post("/users/bob/promote", headers=alice).status_code == 200)
check("admin demotes bob", client.post("/users/bob/demote", headers=alice).status_code == 200)
check("admin cannot self-demote", client.post("/users/alice/demote", headers=alice).status_code == 400)

# --- restored tag route
check("tag: non-admin 403", client.post("/problems/tag", json=dict(name="DP", slug="dp"), headers=bob).status_code == 403)
check("tag: create 201", client.post("/problems/tag", json=dict(name="DP", slug="dp"), headers=alice).status_code == 201)
check("tag: duplicate 409", client.post("/problems/tag", json=dict(name="DP", slug="dp"), headers=alice).status_code == 409)
client.post("/problems/tag", json=dict(name="Graphs", slug="graphs"), headers=alice)

# --- pagination + search/filter
for i, (t, d, tg) in enumerate([("Two Sum", "EASY", '["dp"]'), ("Three Sum", "MEDIUM", '["graphs"]'), ("Shortest Path", "HARD", '["graphs","dp"]')]):
    r = mkprob(alice, f"P{i}", t, d, tg); assert r.status_code == 201, r.text
p1 = client.get("/problems/", params=dict(limit=1, page=1)).json()
check("page 1 starts at first problem (bug fix)", p1["items"][0]["id"] == "P0", str({k: v for k, v in p1.items() if k != 'items'}))
check("pagination metadata", p1["total"] == 3 and p1["has_more"] is True)
p3 = client.get("/problems/", params=dict(limit=1, page=3)).json()
check("last page has_more=false", p3["items"][0]["id"] == "P2" and p3["has_more"] is False)
check("filter difficulty", [i["id"] for i in client.get("/problems/", params=dict(difficulty="HARD")).json()["items"]] == ["P2"])
check("filter tag", client.get("/problems/", params=dict(tag="graphs")).json()["total"] == 2)
check("filter title (case-insens.)", client.get("/problems/", params=dict(title="sum")).json()["total"] == 2)
check("combined filters", client.get("/problems/", params=dict(title="sum", tag="graphs")).json()["total"] == 1)
check("title wildcard escaped", client.get("/problems/", params=dict(title="%")).json()["total"] == 0)

# --- PATCH problem
r = client.patch("/problems/P0", headers=alice, data=dict(title="Two Sum II", difficulty="MEDIUM", visibility="false", tags='["graphs"]'),
                 files={"tests_zip": ("tests.zip", zipbytes(4), "application/zip")})
check("patch 200", r.status_code == 200, r.text[:120])
check("patch applied", r.json()["title"] == "Two Sum II" and r.json()["tags"] == ["graphs"] and r.json()["visibility"] is False)
from shared.core import SessionLocal
from shared.models import TestCase, Problem
with SessionLocal() as db:
    check("testcases swapped 2 -> 4", db.query(TestCase).filter(TestCase.problem_id == "P0").count() == 4)
check("hidden from anon after patch", client.get("/problems/P0").status_code == 404)
check("patch bad tag -> 400", client.patch("/problems/P1", headers=alice, data=dict(tags='["nope"]')).status_code == 400)
check("patch non-admin 403", client.patch("/problems/P1", headers=bob, data=dict(title="x")).status_code == 403)

# --- rate limit (limit=3/min)
codes = [client.post("/submissions/", headers=bob, json=dict(problem_id="P1", code="print(1)", language="PY")) for _ in range(5)]
check("rate limit: 3 ok then 429", [c.status_code for c in codes] == [201, 201, 201, 429, 429])
check("429 has Retry-After", "retry-after" in codes[3].headers)
check("limit is per-user", client.post("/submissions/", headers=alice, json=dict(problem_id="P1", code="1", language="JS")).status_code == 201, "JS accepted too")

# --- judge counters (idempotent under retry)
from judge.judge_worker.pipeline import JudgePipeline
from judge.judge_worker.database import Database
from judge.judge_worker.types import SubmissionResult
from shared.models import Verdict, Submission
pipe = JudgePipeline.__new__(JudgePipeline); pipe.db = Database()
with SessionLocal() as db:
    ids = [s.id for s in db.query(Submission).filter(Submission.problem_id == "P1").order_by(Submission.id).all()]
pipe._update_submission_result(ids[0], SubmissionResult(submission_id=ids[0], verdict=Verdict.ACCEPTED))
pipe._update_submission_result(ids[0], SubmissionResult(submission_id=ids[0], verdict=Verdict.ACCEPTED))  # retry!
pipe._update_submission_result(ids[1], SubmissionResult(submission_id=ids[1], verdict=Verdict.WRONG_ANSWER))
with SessionLocal() as db:
    p = db.query(Problem).get("P1")
    check("counters: total=2 accepted=1 (retry not double-counted)", (p.total_submissions, p.accepted_submissions) == (2, 1), f"{p.total_submissions}/{p.accepted_submissions}")
check("list exposes counters", [i for i in client.get("/problems/").json()["items"] if i["id"] == "P1"][0]["total_submissions"] == 2)

# --- telemetry
h = client.get("/health").json()
check("telemetry reports Stellar", h["status"] == "Mission Control Status: Stellar" and h["postgres"] == "up", str(h))
print(f"\nALL {ok} CHECKS PASSED")
