from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account, AccountType
from app.modules.passengers.models import Passenger
from app.modules.reservations.models import Reservation
from app.modules.reservations.router import (
    get_office_staff,
    require_office_staff,
    require_passenger,
)
from app.modules.staff.models import Staff
from app.modules.tickets import service
from app.modules.tickets.generator import render_qr_png
from app.modules.tickets.models import Ticket
from app.modules.tickets.schemas import TicketChange, TicketChangeResult, TicketRead
from app.modules.trips.models import Trip


router = APIRouter(
    prefix="/tickets",
    tags=["Boletos"],
)


def raise_ticket_error(exc: service.TicketError) -> None:
    """Traduce los errores de negocio a respuestas HTTP."""
    status_by_error = {
        service.TicketNotFoundError: status.HTTP_404_NOT_FOUND,
        service.TicketConflictError: status.HTTP_409_CONFLICT,
        service.TicketValidationError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    }
    raise HTTPException(
        status_code=status_by_error.get(type(exc), status.HTTP_400_BAD_REQUEST),
        detail=str(exc),
    ) from exc


def is_office_staff_of_trip(db: Session, account: Account, trip_id: int) -> bool:
    staff = get_office_staff(db, account)
    return staff is not None and staff.cooperative_id == db.get(Trip, trip_id).cooperative_id


def can_access_ticket(db: Session, account: Account, ticket: Ticket) -> bool:
    """
    Ve el boleto quien lo compró, el pasajero a cuyo nombre está
    y el personal de oficina de la cooperativa del viaje.
    """
    if account.account_type == AccountType.PASSENGER:
        reservation = service.get_ticket_reservation(db, ticket)
        if reservation is not None and reservation.buyer_account_id == account.id:
            return True
        passenger = db.get(Passenger, ticket.passenger_id)
        return passenger.account_id == account.id

    return is_office_staff_of_trip(db, account, ticket.trip_id)


def get_accessible_ticket(db: Session, account: Account, ticket_id: int) -> Ticket:
    try:
        ticket = service.get_ticket(db, ticket_id)
    except service.TicketError as exc:
        raise_ticket_error(exc)

    if not can_access_ticket(db, account, ticket):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Boleto no encontrado.",
        )
    return ticket


@router.get(
    "/me",
    response_model=list[TicketRead],
)
def list_my_tickets(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_passenger)],
):
    """Historial de boletos del pasajero, del viaje más reciente al más antiguo."""
    return [
        service.build_ticket_read(db, ticket)
        for ticket in service.list_account_tickets(db, account.id)
    ]


@router.get(
    "/reservations/{reservation_id}",
    response_model=list[TicketRead],
)
def list_reservation_tickets(
    reservation_id: int,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(get_current_account)],
):
    """Boletos de una reserva, para quien la compró o el personal de oficina."""
    reservation = db.get(Reservation, reservation_id)
    allowed = reservation is not None and (
        reservation.buyer_account_id == account.id
        if account.account_type == AccountType.PASSENGER
        else is_office_staff_of_trip(db, account, reservation.trip_id)
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reserva no encontrada.",
        )
    return [
        service.build_ticket_read(db, ticket)
        for ticket in service.list_reservation_tickets(db, reservation)
    ]


@router.get(
    "/{ticket_id}",
    response_model=TicketRead,
)
def get_ticket(
    ticket_id: int,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(get_current_account)],
):
    """Detalle de un boleto con su vigencia."""
    ticket = get_accessible_ticket(db, account, ticket_id)
    return service.build_ticket_read(db, ticket)
