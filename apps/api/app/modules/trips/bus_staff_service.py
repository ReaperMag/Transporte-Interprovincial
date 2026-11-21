from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.buses.models import Bus, TemplateSeat
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.service import notify
from app.modules.passengers.models import Passenger
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.reservations.service import (
    as_local,
    now_local,
    release_expired_reservations,
)
from app.modules.routes.models import City, Route
from app.modules.sales.models import Payment, PaymentStatus
from app.modules.schedules.models import Frequency
from app.modules.staff.models import Staff
from app.modules.tickets.models import Ticket, TicketStatus
from app.modules.trips.bus_staff_schemas import (
    BusStaffPassenger,
    BusStaffTripDetail,
    BusStaffTripSummary,
)
from app.modules.trips.models import Trip, TripStatus


# El abordaje se puede iniciar desde este tiempo antes de la salida.
BOARDING_WINDOW = timedelta(minutes=30)

# Un bus solo puede tener un viaje en estos estados a la vez.
ACTIVE_TRIP_STATUSES = (TripStatus.BOARDING, TripStatus.IN_PROGRESS)

UNPAID_CANCELLED_MESSAGE = (
    "La venta del viaje se cerró porque empezó el abordaje. Tu reserva no estaba "
    "pagada, así que se canceló y los asientos se liberaron."
)

IN_REVIEW_CANCELLED_MESSAGE = (
    "Empezó el abordaje antes de que se revisara tu comprobante, así que la reserva "
    "se canceló. Acércate a la oficina de la cooperativa con tu comprobante para "
    "que te emitan el boleto o te devuelvan el dinero."
)

# Estados en los que el personal del bus todavía trabaja con el viaje.
OPEN_TRIP_STATUSES = (TripStatus.SCHEDULED, TripStatus.BOARDING, TripStatus.IN_PROGRESS)

# Los viajes programados se muestran desde un día antes de hoy, por si alguno
# quedó sin iniciar.
UPCOMING_LOOKBACK = timedelta(days=1)

# Boletos que cuentan como vendidos para el viaje.
SOLD_TICKET_STATUSES = (
    TicketStatus.ISSUED,
    TicketStatus.USED,
    TicketStatus.REJECTED,
    TicketStatus.NO_SHOW,
)


class BusStaffTripError(Exception):
    """Error de negocio del personal del bus al controlar un viaje."""


class BusStaffTripNotFoundError(BusStaffTripError):
    pass


class BusStaffTripConflictError(BusStaffTripError):
    pass


class BusStaffTicketNotFoundError(BusStaffTripError):
    pass


def ensure_assigned_bus(staff: Staff) -> int:
    if staff.assigned_bus_id is None:
        raise BusStaffTripConflictError("No tienes un bus asignado.")
    return staff.assigned_bus_id


def get_staff_trip(db: Session, staff: Staff, trip_id: int) -> Trip:
    """Viaje del bus asignado al personal; los demás no existen para él."""
    bus_id = ensure_assigned_bus(staff)
    trip = db.get(Trip, trip_id)
    if (
        trip is None
        or trip.bus_id != bus_id
        or trip.cooperative_id != staff.cooperative_id
    ):
        raise BusStaffTripNotFoundError("Viaje no encontrado.")
    return trip


def list_staff_trips(db: Session, staff: Staff) -> list[Trip]:
    """Próximos viajes del bus asignado y los que están en abordaje o en curso."""
    bus_id = ensure_assigned_bus(staff)
    since = now_local() - UPCOMING_LOOKBACK
    trips = db.scalars(
        select(Trip)
        .where(
            Trip.bus_id == bus_id,
            Trip.cooperative_id == staff.cooperative_id,
            Trip.status.in_(OPEN_TRIP_STATUSES),
        )
        .order_by(Trip.departure_at, Trip.id)
    ).all()
    return [
        trip
        for trip in trips
        if trip.status != TripStatus.SCHEDULED or as_local(trip.departure_at) >= since
    ]


def list_trip_tickets(db: Session, trip: Trip) -> list[Ticket]:
    return list(
        db.scalars(
            select(Ticket)
            .where(Ticket.trip_id == trip.id, Ticket.status.in_(SOLD_TICKET_STATUSES))
            .order_by(Ticket.id)
        ).all()
    )


def build_trip_summary(db: Session, trip: Trip) -> BusStaffTripSummary:
    route = db.get(Route, db.get(Frequency, trip.frequency_id).route_id)
    tickets = list_trip_tickets(db, trip)
    return BusStaffTripSummary(
        id=trip.id,
        status=trip.status,
        departureAt=trip.departure_at,
        originCityName=db.get(City, route.origin_city_id).name,
        destinationCityName=db.get(City, route.destination_city_id).name,
        busNumber=db.get(Bus, trip.bus_id).number,
        ticketsSold=len(tickets),
        passengersBoarded=sum(ticket.status == TicketStatus.USED for ticket in tickets),
    )


def build_passenger(db: Session, ticket: Ticket) -> BusStaffPassenger:
    passenger = db.get(Passenger, ticket.passenger_id)
    return BusStaffPassenger(
        ticketId=ticket.id,
        seatNumber=db.get(TemplateSeat, ticket.seat_id).number,
        passengerName=f"{passenger.first_name} {passenger.last_name}",
        passengerIdNumber=passenger.id_number,
        passengerCategory=ticket.passenger_category,
        originCityName=db.get(City, ticket.origin_city_id).name,
        destinationCityName=db.get(City, ticket.destination_city_id).name,
        channel=ticket.channel,
        price=ticket.price,
        status=ticket.status,
        validatedAt=ticket.validated_at,
        rejectionReason=ticket.rejection_reason,
    )


def build_trip_detail(db: Session, trip: Trip) -> BusStaffTripDetail:
    summary = build_trip_summary(db, trip)
    passengers = sorted(
        (build_passenger(db, ticket) for ticket in list_trip_tickets(db, trip)),
        key=lambda passenger: passenger.seatNumber,
    )
    return BusStaffTripDetail(
        **summary.model_dump(),
        boardingStartedAt=trip.boarding_started_at,
        startedAt=trip.started_at,
        finishedAt=trip.finished_at,
        passengers=passengers,
    )


def cancel_unpaid_reservations(db: Session, trip: Trip) -> int:
    """
    Al iniciar el abordaje se cancelan las reservas que no llegaron a pagarse
    o que tienen el comprobante sin revisar, y se avisa a cada pasajero.
    """
    reservations = db.scalars(
        select(Reservation).where(
            Reservation.trip_id == trip.id,
            Reservation.status.in_(
                (ReservationStatus.PENDING_PAYMENT, ReservationStatus.PAYMENT_REVIEW)
            ),
        )
    ).all()

    for reservation in reservations:
        in_review = reservation.status == ReservationStatus.PAYMENT_REVIEW
        reservation.status = ReservationStatus.CANCELLED
        reservation.expires_at = None
        reservation.review_expires_at = None
        for payment in db.scalars(
            select(Payment).where(
                Payment.reservation_id == reservation.id,
                Payment.status == PaymentStatus.PENDING,
            )
        ).all():
            payment.status = PaymentStatus.EXPIRED

        notify(
            db,
            account_id=reservation.buyer_account_id,
            event=NotificationEvent.RESERVATION_CANCELLED,
            title="Reserva cancelada por el abordaje",
            message=IN_REVIEW_CANCELLED_MESSAGE if in_review else UNPAID_CANCELLED_MESSAGE,
            reservation_id=reservation.id,
        )

    return len(reservations)


def start_boarding(db: Session, staff: Staff, trip_id: int) -> Trip:
    """
    Inicia el abordaje: cierra la venta del viaje, cancela las reservas sin
    pagar y permite validar los boletos.
    """
    release_expired_reservations(db)
    trip = get_staff_trip(db, staff, trip_id)

    if trip.status != TripStatus.SCHEDULED:
        raise BusStaffTripConflictError("El abordaje de este viaje ya se inició.")

    if now_local() < as_local(trip.departure_at) - BOARDING_WINDOW:
        raise BusStaffTripConflictError(
            "El abordaje se puede iniciar desde 30 minutos antes de la salida."
        )

    active_trip = db.scalar(
        select(Trip.id).where(
            Trip.bus_id == trip.bus_id,
            Trip.id != trip.id,
            Trip.status.in_(ACTIVE_TRIP_STATUSES),
        )
    )
    if active_trip is not None:
        raise BusStaffTripConflictError(
            "El bus ya tiene otro viaje en abordaje o en curso."
        )

    trip.status = TripStatus.BOARDING
    trip.boarding_started_at = now_local()
    trip.boarding_started_by_id = staff.id
    cancel_unpaid_reservations(db, trip)

    db.commit()
    db.refresh(trip)
    return trip
