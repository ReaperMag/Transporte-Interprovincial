from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.cooperatives.router import router as cooperatives_router
from app.modules.passengers.router import router as passengers_router
from app.modules.trips.router import router as trips_router


router = APIRouter(prefix="/api/v1")

router.include_router(auth_router)
router.include_router(cooperatives_router)
router.include_router(passengers_router)
router.include_router(trips_router)