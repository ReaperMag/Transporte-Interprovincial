
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.router import router as api_v1_router
from app.core.bootstrap import ensure_initial_admin
from app.core.config import settings
from app.core.database import SessionLocal, init_db


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    if getattr(application.state, "initialize_database_on_startup", True):
        init_db()
    session_factory = getattr(application.state, "session_factory", SessionLocal)
    with session_factory() as db:
        ensure_initial_admin(db)
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(api_v1_router)
