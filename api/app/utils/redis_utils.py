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



# ---------------------------------------------------------------------------
# Launch-window governor: fixed-window per-user rate limiting on Redis.
# ---------------------------------------------------------------------------
def check_rate_limit(bucket: str, identity, limit: int, window_sec: int):
    """Register one launch attempt.

    Returns (allowed, remaining, retry_after_sec). INCR is atomic, so parallel
    API workers cannot slip extra rockets past the gantry.
    """
    key = f"ratelimit:{bucket}:{identity}"
    client = get_redis_client()

    pipe = client.pipeline()
    pipe.incr(key)
    pipe.ttl(key)
    count, ttl = pipe.execute()

    # First ignition of the window (or a key that lost its TTL): start the clock
    if count == 1 or ttl == -1:
        client.expire(key, window_sec)
        ttl = window_sec

    allowed = count <= limit
    return allowed, max(limit - count, 0), max(int(ttl), 1)
