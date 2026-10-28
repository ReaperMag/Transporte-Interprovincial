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

# Puestos que pueden vender asientos en la oficina.
OFFICE_SALE_POSITIONS = (
    StaffPosition.CLERK,
    StaffPosition.ADMIN,
)


def require_passenger(
    account: Annotated[Account, Depends(get_current_account)],
) -> Account:
    """Permite la operación solo a cuentas de pasajero."""
    if account.account_type != AccountType.PASSENGER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta operación es exclusiva para pasajeros.",
        )
    return account


def get_office_staff(db: Session, account: Account) -> Staff | None:
    """Devuelve el oficinista activo vinculado a la cuenta, si existe."""
    if account.account_type != AccountType.COOPERATIVE:
        return None

    staff = db.scalar(select(Staff).where(Staff.account_id == account.id))
    if (
        staff is None
        or not staff.is_active
        or staff.position not in OFFICE_SALE_POSITIONS
    ):
        return None

    return staff


def require_office_staff(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(get_current_account)],
) -> Staff:
    """Permite la operación solo al personal de oficina de una cooperativa."""
    staff = get_office_staff(db, account)
    if staff is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta operación es exclusiva para el personal de oficina.",
        )
    return staff


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


def ensure_can_access(
    db: Session,
    account: Account,
    reservation: Reservation,
) -> None:
    """
    El pasajero solo ve sus propias reservas.
    El personal de oficina ve las reservas de los viajes de su cooperativa.
    """
    if account.account_type == AccountType.PASSENGER:
        if reservation.buyer_account_id == account.id:
            return
    else:
        staff = get_office_staff(db, account)
        trip_cooperative_id = service.get_reservation_cooperative_id(db, reservation)
        if staff is not None and staff.cooperative_id == trip_cooperative_id:
            return

    # Se responde 404 para no revelar reservas de otras personas.
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Reserva no encontrada.",
    )


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


@router.post(
    "",
    response_model=ReservationRead,
    status_code=status.HTTP_201_CREATED,
)
def create_passenger_reservation(
    payload: ReservationCreate,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_passenger)],
    _: None = Depends(validate_request_origin),
):
    """El pasajero aparta asientos para él y sus acompañantes."""
    try:
        reservation = service.create_reservation(
            db,
            payload,
            buyer_account_id=account.id,
        )
    except service.ReservationError as exc:
        raise_reservation_error(exc)

    return service.build_reservation_read(db, reservation)


@router.post(
    "/office",
    response_model=ReservationRead,
    status_code=status.HTTP_201_CREATED,
)
def create_office_reservation(
    payload: ReservationCreate,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_office_staff)],
    _: None = Depends(validate_request_origin),
):
    """El oficinista aparta asientos para pasajeros que compran en la oficina."""
    try:
        reservation = service.create_reservation(
            db,
            payload,
            sold_by=staff,
        )
    except service.ReservationError as exc:
        raise_reservation_error(exc)

    return service.build_reservation_read(db, reservation)


@router.get(
    "/me",
    response_model=list[ReservationRead],
)
def list_my_reservations(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_passenger)],
):
    """Lista las reservas del pasajero autenticado."""
    reservations = service.list_account_reservations(db, account.id)
    return [
        service.build_reservation_read(db, reservation)
        for reservation in reservations
    ]


@router.get(
    "/{reservation_id}",
    response_model=ReservationRead,
)
def get_reservation(
    reservation_id: int,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(get_current_account)],
):
    """Muestra el detalle de una reserva."""
    service.release_expired_reservations(db)

    try:
        reservation = service.get_reservation(db, reservation_id)
    except service.ReservationError as exc:
        raise_reservation_error(exc)

    ensure_can_access(db, account, reservation)
    return service.build_reservation_read(db, reservation)


@router.post(
    "/{reservation_id}/cancel",
    response_model=ReservationRead,
)
def cancel_reservation(
    reservation_id: int,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(get_current_account)],
    _: None = Depends(validate_request_origin),
):
    """Cancela una reserva y libera sus asientos."""
    try:
        reservation = service.get_reservation(db, reservation_id)
        ensure_can_access(db, account, reservation)
        reservation = service.cancel_reservation(db, reservation)
    except service.ReservationError as exc:
        raise_reservation_error(exc)

    return service.build_reservation_read(db, reservation)
