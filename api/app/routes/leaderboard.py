from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List

from ..schemas.problems import LeaderboardEntry
from ..utils.redis_utils import get_redis_client
from ..database import get_db

from shared.models import User

router = APIRouter(
    tags=["Leaderboard"]
)


# ── Feature: Global Leaderboard ───────────────────────────────────────────────
@router.get('/leaderboard', status_code=status.HTTP_200_OK, response_model=List[LeaderboardEntry])
def get_leaderboard(db: Session = Depends(get_db)):
    """
    Return a ranked list of users sorted by unique problems solved (descending).

    Reads scores from the ``leaderboard:global`` Redis sorted set,
    resolves user IDs to usernames via the database, and assigns ranks.
    """
    r = get_redis_client()

    # ZREVRANGEBYSCORE returns members in descending-score order.
    # withscores=True yields a list of (member, score) tuples.
    entries = r.zrevrangebyscore(
        "leaderboard:global",
        "+inf",
        "-inf",
        withscores=True,
    )

    if not entries:
        return []

    # Resolve user IDs → usernames in a single query
    user_ids = [int(uid) for uid, _ in entries]
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    id_to_username = {u.id: u.username for u in users}

    result: List[LeaderboardEntry] = []
    for rank, (uid_str, score) in enumerate(entries, start=1):
        uid = int(uid_str)
        username = id_to_username.get(uid)
        if username is None:
            continue  # skip deleted / unknown users
        result.append(LeaderboardEntry(
            rank=rank,
            username=username,
            solved=int(score),
        ))

    return result
