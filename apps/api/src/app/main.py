
from fastapi import FastAPI

from app.api.v1.router import router as api_v1_router
from app.core.config import settings


# Crear la aplicación principal de FastAPI.
app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
)


# Registrar los endpoints de la versión 1.
app.include_router(api_v1_router)
