from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_bus_staff
from app.modules.staff.models import Staff
from app.modules.trips import bus_staff_service as service
from app.modules.trips.bus_staff_schemas import BusStaffTripDetail, BusStaffTripSummary


router = APIRouter(prefix="/bus-staff/trips", tags=["Personal del bus"])


def raise_trip_error(exc: service.BusStaffTripError) -> NoReturn:
    status_codes = {
        service.BusStaffTripNotFoundError: status.HTTP_404_NOT_FOUND,
        service.BusStaffTicketNotFoundError: status.HTTP_404_NOT_FOUND,
        service.BusStaffTripConflictError: status.HTTP_409_CONFLICT,
    }
    raise HTTPException(
        status_code=status_codes.get(type(exc), status.HTTP_400_BAD_REQUEST),
        detail=str(exc),
    ) from exc


@router.get("", response_model=list[BusStaffTripSummary])
def list_my_trips(
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
):
    """Próximos viajes del bus asignado, con los que están en abordaje o en curso."""
    try:
        trips = service.list_staff_trips(db, staff)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)
    return [service.build_trip_summary(db, trip) for trip in trips]


@router.get("/{trip_id}", response_model=BusStaffTripDetail)
def read_my_trip(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
):
    """Detalle del viaje con la lista de pasajeros y su estado de abordaje."""
    try:
        trip = service.get_staff_trip(db, staff, trip_id)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)
    return service.build_trip_detail(db, trip)
