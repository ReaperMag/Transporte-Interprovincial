from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_bus_staff
from app.modules.reports import service
from app.modules.reports.schemas import TripReport
from app.modules.staff.models import Staff
from app.modules.trips.bus_staff_router import raise_trip_error
from app.modules.trips.bus_staff_service import BusStaffTripError, get_staff_trip


bus_staff_router = APIRouter(prefix="/bus-staff", tags=["Reportes de viaje"])


def raise_report_error(exc: BusStaffTripError) -> NoReturn:
    if isinstance(exc, service.TripReportNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    raise_trip_error(exc)


@bus_staff_router.get("/trips/{trip_id}/report", response_model=TripReport)
def read_my_trip_report(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
):
    """Reporte de un viaje del bus asignado, desde que empieza el abordaje."""
    try:
        return service.build_trip_report(db, get_staff_trip(db, staff, trip_id))
    except BusStaffTripError as exc:
        raise_report_error(exc)
