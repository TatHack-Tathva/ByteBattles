from functools import cache
from redis import Redis
from config import REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_JOB_LIST

redis_client = Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

@cache
def get_redis_client():
    return Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=True,
    )

def enqueue_job(submission_id: int):
    get_redis_client().lpush(REDIS_JOB_LIST, submission_id)


# ── Feature: Login Rate Limiting ──────────────────────────────────────────────
def check_rate_limit(key: str, max_attempts: int = 5, window_seconds: int = 60) -> bool:
    """
    Increment a Redis counter for `key` and return True if the limit is exceeded.

    Uses atomic INCR + EXPIRE so the window starts on the first attempt and
    the counter is automatically cleaned up.

    Returns:
        True  – the request should be BLOCKED  (limit exceeded)
        False – the request is allowed
    """
    r = get_redis_client()
    current = r.incr(key)
    if current == 1:
        r.expire(key, window_seconds)
    return current > max_attempts


# ── Feature: Global Leaderboard ───────────────────────────────────────────────
# Lua script: atomically check if user already solved this problem.
# If not, mark it and increment the sorted-set score.
_LEADERBOARD_LUA = """
local marker_key   = KEYS[1]
local leaderboard  = KEYS[2]
local user_id      = ARGV[1]

local created = redis.call("SET", marker_key, "1", "NX")
if created then
    redis.call("ZINCRBY", leaderboard, 1, user_id)
    return 1
end
return 0
"""

_leaderboard_script = None  # lazy-loaded

def update_leaderboard(user_id: int, problem_id: str) -> bool:
    """
    Record a first-time AC for *user_id* on *problem_id*.

    Returns True if the leaderboard was updated (first AC), False otherwise.
    """
    global _leaderboard_script
    r = get_redis_client()

    if _leaderboard_script is None:
        _leaderboard_script = r.register_script(_LEADERBOARD_LUA)

    marker_key = f"leaderboard:solved:{user_id}:{problem_id}"
    leaderboard_key = "leaderboard:global"

    result = _leaderboard_script(
        keys=[marker_key, leaderboard_key],
        args=[str(user_id)],
    )
    return bool(result)
