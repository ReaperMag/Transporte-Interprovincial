from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.buses.router import (
    cooperative_buses_router,
    cooperative_bus_groups_router,
)
from app.modules.cooperatives.router import (
    cooperative_router,
    router as cooperatives_router,
)
from app.modules.notifications.router import router as notifications_router
from app.modules.passengers.router import router as passengers_router
from app.modules.reservations.router import router as reservations_router
from app.modules.routes.cooperative_router import router as cooperative_routes_router
from app.modules.sales.router import router as payments_router
from app.modules.schedules.cooperative_router import router as cooperative_schedules_router
from app.modules.tickets.router import router as tickets_router
from app.modules.trips.router import router as trips_router


router = APIRouter(prefix="/api/v1")

router.include_router(auth_router)
router.include_router(cooperative_bus_groups_router)
router.include_router(cooperative_buses_router)
router.include_router(cooperative_routes_router)
router.include_router(cooperative_schedules_router)
router.include_router(cooperative_router)
router.include_router(cooperatives_router)
router.include_router(notifications_router)
router.include_router(passengers_router)
router.include_router(payments_router)
router.include_router(reservations_router)
router.include_router(tickets_router)
router.include_router(trips_router)