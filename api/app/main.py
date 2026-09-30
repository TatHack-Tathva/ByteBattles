from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from shared.core import engine, Base
from shared import models
from .routes import auth, users, problems, submissions

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(problems.router)
app.include_router(submissions.router)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
    )
    optional_auth_routes = (
        ("/users/{username}", "get"),
        ("/problems/", "get"),
        ("/problems/{problem_id}", "get"),
        ("/submissions/", "get"),
    )
    for path, method in optional_auth_routes:
        operation = schema.get("paths", {}).get(path, {}).get(method)
        if operation is None:
            continue
        security = operation.get("security", [])
        if {} not in security:
            operation["security"] = [*security, {}]

    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi
