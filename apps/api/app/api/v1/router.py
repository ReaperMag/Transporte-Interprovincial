
from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.cooperatives.router import router as cooperatives_router


router = APIRouter(prefix="/api/v1")

# Incorporar las rutas de autenticación.
router.include_router(auth_router)
router.include_router(cooperatives_router)
