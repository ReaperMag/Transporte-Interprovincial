from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account, AccountType
from app.modules.reservations import service
from app.modules.reservations.models import Reservation
from app.modules.reservations.schemas import (
    ReservationCreate,
    ReservationRead,
    TripSeatsResponse,
)
from app.modules.staff.models import Staff, StaffPosition


router = APIRouter(
    prefix="/reservations",
    tags=["Reservas"],
)


def raise_reservation_error(exc: service.ReservationError) -> None:
    """Traduce los errores de negocio a respuestas HTTP."""
    status_by_error = {
        service.TripNotFoundError: status.HTTP_404_NOT_FOUND,
        service.ReservationNotFoundError: status.HTTP_404_NOT_FOUND,
        service.InvalidSegmentError: status.HTTP_422_UNPROCESSABLE_CONTENT,
        service.FareNotFoundError: status.HTTP_422_UNPROCESSABLE_CONTENT,
        service.SeatUnavailableError: status.HTTP_409_CONFLICT,
        service.ReservationNotCancellableError: status.HTTP_409_CONFLICT,
    }
    raise HTTPException(
        status_code=status_by_error.get(type(exc), status.HTTP_400_BAD_REQUEST),
        detail=str(exc),
    ) from exc


@router.get(
    "/trips/{trip_id}/seats",
    response_model=TripSeatsResponse,
)
def get_trip_seats(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[Account, Depends(get_current_account)],
    origin_city_id: Annotated[int, Query(gt=0)],
    destination_city_id: Annotated[int, Query(gt=0)],
):
    """
    Muestra los asientos del viaje y cuáles están libres
    para el tramo elegido.
    """
    try:
        return service.get_trip_seats(
            db,
            trip_id,
            origin_city_id,
            destination_city_id,
        )
    except service.ReservationError as exc:
        raise_reservation_error(exc)
