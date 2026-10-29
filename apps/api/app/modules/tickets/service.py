from datetime import timedelta
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.modules.buses.models import Bus, TemplateSeat
from app.modules.cooperatives.models import Cooperative
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.service import notify
from app.modules.passengers.models import Passenger, PassengerCategory
from app.modules.reservations.models import Reservation, ReservationSeat
from app.modules.reservations.service import (
    as_local,
    calculate_discount,
    get_fare_price,
    get_occupied_seat_ids,
    get_route_city_order,
    now_local,
)
from app.modules.routes.models import City, Route
from app.modules.sales.models import Payment, PaymentMethod, PaymentStatus
from app.modules.schedules.models import Frequency
from app.modules.staff.models import Staff
from app.modules.tickets.generator import generate_ticket_code
from app.modules.tickets.models import SaleChannel, Ticket, TicketStatus
from app.modules.tickets.schemas import TicketRead, TicketValidity
from app.modules.trips.models import Trip, TripStatus


# Si la ruta no tiene duración registrada, el boleto vence un día después de la salida.
DEFAULT_TRIP_DURATION = timedelta(days=1)


class TicketError(Exception):
    """Error de negocio al consultar o cambiar un boleto."""


class TicketNotFoundError(TicketError):
    pass


class TicketConflictError(TicketError):
    pass


class TicketValidationError(TicketError):
    pass


def issue_tickets(db: Session, reservation: Reservation) -> list[Ticket]:
    """
    Emite un boleto por cada asiento de una reserva confirmada.

    Cada boleto tiene un código aleatorio para su QR. No confirma la
    transacción: lo hace el pago que confirmó la reserva.
    """
    channel = SaleChannel.OFFICE if reservation.sold_by_id else SaleChannel.ONLINE
    tickets = []

    for seat in reservation.seats:
        ticket = Ticket(
            code=generate_ticket_code(),
            trip_id=reservation.trip_id,
            seat_id=seat.seat_id,
            passenger_id=seat.passenger_id,
            reservation_seat_id=seat.id,
            channel=channel,
            origin_city_id=seat.origin_city_id,
            destination_city_id=seat.destination_city_id,
            passenger_category=seat.passenger_category,
            price=seat.price,
            status=TicketStatus.ISSUED,
            sold_by_id=reservation.sold_by_id,
        )
        db.add(ticket)
        tickets.append(ticket)

    count = len(tickets)
    notify(
        db,
        account_id=reservation.buyer_account_id,
        event=NotificationEvent.TICKET_ISSUED,
        title="Boletos emitidos",
        message=(
            f"Se emitieron {count} boletos. Puedes verlos en Mis boletos."
            if count != 1
            else "Se emitió tu boleto. Puedes verlo en Mis boletos."
        ),
        reservation_id=reservation.id,
    )

    return tickets
