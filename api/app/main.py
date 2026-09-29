from fastapi import FastAPI, Depends
from sqlalchemy import text

from shared.core import engine, Base
from shared import models
from .database import get_db
from .utils.redis_utils import get_redis_client
from .utils.telemetry import cosmo_polo_telemetry
from .routes import auth, users, problems, submissions

Base.metadata.create_all(bind=engine)

# Fuel-line migration: create_all never extends an existing Postgres ENUM, so
# dock the newer language modules (JS) onto older databases explicitly.
if engine.dialect.name == "postgresql":
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as _conn:
        _conn.execute(text("ALTER TYPE language ADD VALUE IF NOT EXISTS 'JAVASCRIPT'"))

app = FastAPI()

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(problems.router)
app.include_router(submissions.router)

@app.get("/health", tags=["Telemetry"])
def health(db=Depends(get_db)):
    # Ground-station heartbeat for the whole constellation
    return cosmo_polo_telemetry(get_redis_client(), db)
