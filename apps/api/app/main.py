
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.router import router as api_v1_router
from app.core.bootstrap import ensure_initial_admin, initialize_roles
from app.core.config import settings
from app.core.database import SessionLocal, init_db
from app.modules.routes.geographic_service import ensure_geographic_catalog


# Muestra en consola los mensajes de la aplicación (por ejemplo, los correos
# que no se envían cuando EMAIL_ENABLED=false). Uvicorn configura solo sus
# propios registros, así que sin esto los mensajes INFO no aparecerían.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    initialize_database = getattr(application.state, "initialize_database_on_startup", True)
    if initialize_database:
        init_db()
    session_factory = getattr(application.state, "session_factory", SessionLocal)
    with session_factory() as db:
        initialize_roles(db)
        if initialize_database:
            ensure_geographic_catalog(db)
        ensure_initial_admin(db)
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0-alpha.1",
    lifespan=lifespan,
)

app.include_router(api_v1_router)
