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


def get_ticket_validity(ticket: Ticket, trip: Trip, route: Route) -> TicketValidity:
    """
    Indica si el boleto todavía sirve para subir al bus.
    Deja de servir cuando se usa, se cancela o el viaje termina.
    """
    if ticket.status == TicketStatus.CANCELLED:
        return TicketValidity.CANCELLED

    if ticket.status == TicketStatus.USED:
        return TicketValidity.USED

    if trip.status in (TripStatus.FINISHED, TripStatus.CANCELLED):
        return TicketValidity.EXPIRED

    duration = (
        timedelta(minutes=route.duration_minutes)
        if route.duration_minutes
        else DEFAULT_TRIP_DURATION
    )
    if now_local() > as_local(trip.departure_at) + duration:
        return TicketValidity.EXPIRED

    return TicketValidity.VALID


def build_ticket_read(db: Session, ticket: Ticket) -> TicketRead:
    trip = db.get(Trip, ticket.trip_id)
    route = db.get(Route, db.get(Frequency, trip.frequency_id).route_id)
    seat = db.get(TemplateSeat, ticket.seat_id)
    passenger = db.get(Passenger, ticket.passenger_id)
    reservation_seat = (
        db.get(ReservationSeat, ticket.reservation_seat_id)
        if ticket.reservation_seat_id
        else None
    )

    return TicketRead(
        id=ticket.id,
        code=ticket.code,
        status=ticket.status,
        validity=get_ticket_validity(ticket, trip, route),
        channel=ticket.channel,
        reservationId=reservation_seat.reservation_id if reservation_seat else None,
        tripId=trip.id,
        cooperativeName=db.get(Cooperative, trip.cooperative_id).name,
        busNumber=db.get(Bus, trip.bus_id).number,
        departureAt=trip.departure_at,
        originCityName=db.get(City, ticket.origin_city_id).name,
        destinationCityName=db.get(City, ticket.destination_city_id).name,
        seatId=seat.id,
        seatNumber=seat.number,
        seatType=seat.seat_type,
        passengerName=f"{passenger.first_name} {passenger.last_name}",
        passengerIdNumber=passenger.id_number,
        passengerCategory=ticket.passenger_category,
        price=ticket.price,
        issuedAt=ticket.created_at,
    )


def get_ticket_reservation(db: Session, ticket: Ticket) -> Reservation | None:
    if ticket.reservation_seat_id is None:
        return None
    seat = db.get(ReservationSeat, ticket.reservation_seat_id)
    return db.get(Reservation, seat.reservation_id)


def get_ticket(db: Session, ticket_id: int) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        raise TicketNotFoundError("Boleto no encontrado.")
    return ticket


def list_account_tickets(db: Session, account_id: int) -> list[Ticket]:
    """
    Historial de boletos de un pasajero con cuenta: los que compró, incluidos
    los de sus acompañantes, y los emitidos a su nombre en oficina o como
    venta extra antes de que se registrara.
    """
    bought = (
        select(ReservationSeat.id)
        .join(Reservation, ReservationSeat.reservation_id == Reservation.id)
        .where(Reservation.buyer_account_id == account_id)
    )
    own_passenger = select(Passenger.id).where(Passenger.account_id == account_id)

    return list(
        db.scalars(
            select(Ticket)
            .join(Trip, Ticket.trip_id == Trip.id)
            .where(
                or_(
                    Ticket.reservation_seat_id.in_(bought),
                    Ticket.passenger_id.in_(own_passenger),
                )
            )
            .order_by(Trip.departure_at.desc(), Ticket.id)
        ).all()
    )


def list_reservation_tickets(db: Session, reservation: Reservation) -> list[Ticket]:
    seat_ids = [seat.id for seat in reservation.seats]
    return list(
        db.scalars(
            select(Ticket)
            .where(Ticket.reservation_seat_id.in_(seat_ids))
            .order_by(Ticket.id)
        ).all()
    )


def change_ticket(
    db: Session,
    ticket_id: int,
    staff: Staff,
    category: PassengerCategory,
    new_seat_id: int | None,
) -> tuple[Ticket, Ticket, Decimal]:
    """
    Cambia un boleto en la oficina, por ejemplo cuando el chofer detecta
    que la categoría declarada no corresponde o el pasajero quiere otro asiento.

    El boleto anterior se cancela y se emite uno nuevo con otro código.
    Si el nuevo cuesta más, se registra el cobro de la diferencia en efectivo;
    si cuesta menos, no hay devolución.
    """
    ticket = get_ticket(db, ticket_id)
    trip = db.get(Trip, ticket.trip_id)

    if trip.cooperative_id != staff.cooperative_id:
        raise TicketNotFoundError("Boleto no encontrado.")

    route = db.get(Route, db.get(Frequency, trip.frequency_id).route_id)
    if get_ticket_validity(ticket, trip, route) != TicketValidity.VALID:
        raise TicketConflictError("Solo se pueden cambiar boletos vigentes.")

    reservation = get_ticket_reservation(db, ticket)
    if reservation is None:
        raise TicketValidationError("Solo se pueden cambiar boletos emitidos desde una reserva.")

    reservation_seat = db.get(ReservationSeat, ticket.reservation_seat_id)
    seat = db.get(TemplateSeat, ticket.seat_id)

    if new_seat_id is not None and new_seat_id != seat.id:
        bus = db.get(Bus, trip.bus_id)
        new_seat = db.get(TemplateSeat, new_seat_id)
        if new_seat is None or new_seat.template_id != bus.template_id:
            raise TicketValidationError("El asiento no pertenece al bus de este viaje.")

        city_order = get_route_city_order(route)
        segment = (
            city_order.index(ticket.origin_city_id),
            city_order.index(ticket.destination_city_id),
        )
        if new_seat.id in get_occupied_seat_ids(db, trip, segment):
            raise TicketConflictError(f"El asiento {new_seat.number} ya está ocupado.")
        seat = new_seat

    base_price = get_fare_price(
        db,
        route.id,
        ticket.origin_city_id,
        ticket.destination_city_id,
        seat,
    )
    discount = calculate_discount(base_price, category)
    new_price = base_price - discount
    amount_charged = max(new_price - ticket.price, Decimal("0.00"))

    # El boleto anterior queda cancelado y libera su vínculo con el asiento reservado.
    ticket.status = TicketStatus.CANCELLED
    ticket.reservation_seat_id = None
    db.flush()

    reservation_seat.seat_id = seat.id
    reservation_seat.seat_type = seat.seat_type
    reservation_seat.passenger_category = category
    reservation_seat.base_price = base_price
    reservation_seat.discount_amount = discount
    reservation_seat.price = new_price

    new_ticket = Ticket(
        code=generate_ticket_code(),
        trip_id=trip.id,
        seat_id=seat.id,
        passenger_id=ticket.passenger_id,
        reservation_seat_id=reservation_seat.id,
        channel=SaleChannel.OFFICE,
        origin_city_id=ticket.origin_city_id,
        destination_city_id=ticket.destination_city_id,
        passenger_category=category,
        price=new_price,
        status=TicketStatus.ISSUED,
        sold_by_id=staff.id,
    )
    db.add(new_ticket)

    if amount_charged > 0:
        db.add(
            Payment(
                reservation_id=reservation.id,
                method=PaymentMethod.CASH,
                amount=amount_charged,
                status=PaymentStatus.APPROVED,
                reviewed_by_id=staff.id,
                reviewed_at=now_local(),
            )
        )
        reservation.total = reservation.total + amount_charged

    notify(
        db,
        account_id=reservation.buyer_account_id,
        event=NotificationEvent.TICKET_ISSUED,
        title="Boleto cambiado",
        message=(
            f"Se cambió el boleto del asiento {db.get(TemplateSeat, ticket.seat_id).number}. "
            "El boleto anterior ya no es válido; usa el nuevo de Mis boletos."
        ),
        reservation_id=reservation.id,
    )

    db.commit()
    db.refresh(ticket)
    db.refresh(new_ticket)
    return ticket, new_ticket, amount_charged
