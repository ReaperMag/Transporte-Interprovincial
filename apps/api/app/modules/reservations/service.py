from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.buses.models import Bus, BusTemplate, TemplateSeat
from app.modules.cooperatives.models import Cooperative
from app.modules.passengers.models import Passenger, PassengerCategory
from app.modules.passengers.repository import get_passenger_by_id_number
from app.modules.reservations.models import (
    Reservation,
    ReservationSeat,
    ReservationStatus,
)
from app.modules.reservations.schemas import (
    ReservationCreate,
    ReservationPassengerInput,
    ReservationRead,
    ReservationSeatRead,
    SeatAvailability,
    TripSeatsResponse,
)
from app.modules.routes.models import Fare, Route, RouteType
from app.modules.schedules.models import Frequency
from app.modules.staff.models import Staff
from app.modules.tickets.models import Ticket, TicketStatus
from app.modules.trips.models import Trip, TripStatus
from app.modules.trips.service import ECUADOR_TIMEZONE


# Estados en los que una reserva sigue ocupando sus asientos.
ACTIVE_STATUSES = (
    ReservationStatus.PENDING_PAYMENT,
    ReservationStatus.PAYMENT_REVIEW,
    ReservationStatus.CONFIRMED,
)

# Estados en los que todavía se puede cancelar una reserva.
CANCELLABLE_STATUSES = (
    ReservationStatus.PENDING_PAYMENT,
    ReservationStatus.PAYMENT_REVIEW,
)

# Menores de edad, tercera edad y personas con discapacidad pagan la mitad.
DISCOUNT_RATE = Decimal("0.50")

CENTS = Decimal("0.01")


class ReservationError(Exception):
    """Error de negocio al consultar o crear una reserva."""


class TripNotFoundError(ReservationError):
    pass


class InvalidSegmentError(ReservationError):
    pass


class SeatUnavailableError(ReservationError):
    pass


class FareNotFoundError(ReservationError):
    pass


class ReservationNotFoundError(ReservationError):
    pass


class ReservationNotCancellableError(ReservationError):
    pass


def now_local() -> datetime:
    """Hora actual de Ecuador, la misma que usa la búsqueda de viajes."""
    return datetime.now(ECUADOR_TIMEZONE)


def as_local(value: datetime) -> datetime:
    """
    SQLite devuelve las fechas sin zona horaria.
    Se interpretan como hora de Ecuador para poder compararlas.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=ECUADOR_TIMEZONE)
    return value.astimezone(ECUADOR_TIMEZONE)


# ---------------------------------------------------------------------------
# Viaje y tramo
# ---------------------------------------------------------------------------


def get_bookable_trip(db: Session, trip_id: int) -> Trip:
    """
    Obtiene un viaje que todavía se puede vender:
    programado, con salida futura y de una cooperativa activa.
    """
    trip = db.scalar(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.frequency)
            .selectinload(Frequency.route)
            .selectinload(Route.stops),
            selectinload(Trip.bus).selectinload(Bus.template),
        )
    )

    if trip is None or trip.status != TripStatus.SCHEDULED:
        raise TripNotFoundError("El viaje no existe o ya no está disponible.")

    if as_local(trip.departure_at) <= now_local():
        raise TripNotFoundError("El viaje ya salió.")

    cooperative = db.get(Cooperative, trip.cooperative_id)
    if cooperative is None or not cooperative.is_active:
        raise TripNotFoundError("El viaje no existe o ya no está disponible.")

    return trip


def get_route_city_order(route: Route) -> list[int]:
    """
    Devuelve las ciudades de la ruta en el orden en que las recorre el bus:
    origen, paradas intermedias y destino.
    """
    stops = sorted(route.stops, key=lambda stop: stop.stop_order)
    return [
        route.origin_city_id,
        *(stop.city_id for stop in stops),
        route.destination_city_id,
    ]


def get_segment(
    route: Route,
    origin_city_id: int,
    destination_city_id: int,
) -> tuple[int, int]:
    """
    Convierte un tramo en posiciones dentro de la ruta.

    Por ejemplo, en Quito - Latacunga - Ambato - Loja,
    el tramo Latacunga - Loja es (1, 3).
    """
    city_order = get_route_city_order(route)

    if (
        origin_city_id not in city_order
        or destination_city_id not in city_order
    ):
        raise InvalidSegmentError("El tramo no pertenece a la ruta del viaje.")

    start = city_order.index(origin_city_id)
    end = city_order.index(destination_city_id)

    if start >= end:
        raise InvalidSegmentError("El destino debe estar después del origen en la ruta.")

    if route.route_type == RouteType.DIRECT and start != 0:
        raise InvalidSegmentError(
            "En una ruta directa solo se puede comprar desde la ciudad de origen."
        )

    return start, end


def segments_overlap(first: tuple[int, int], second: tuple[int, int]) -> bool:
    """
    Dos tramos se cruzan si comparten al menos una parte del recorrido.
    Quito - Latacunga y Latacunga - Loja no se cruzan.
    """
    return first[0] < second[1] and second[0] < first[1]


def get_occupied_seat_ids(
    db: Session,
    trip: Trip,
    segment: tuple[int, int],
) -> set[int]:
    """
    Devuelve los asientos del viaje que ya están ocupados
    en alguna parte del tramo consultado.
    """
    route = trip.frequency.route
    city_order = get_route_city_order(route)
    occupied: set[int] = set()

    reserved_seats = db.scalars(
        select(ReservationSeat)
        .join(Reservation, ReservationSeat.reservation_id == Reservation.id)
        .where(
            Reservation.trip_id == trip.id,
            Reservation.status.in_(ACTIVE_STATUSES),
        )
    ).all()

    # Boletos que no pasan por una reserva, como la venta extra del chofer.
    direct_tickets = db.scalars(
        select(Ticket).where(
            Ticket.trip_id == trip.id,
            Ticket.reservation_seat_id.is_(None),
            Ticket.status != TicketStatus.CANCELLED,
        )
    ).all()

    for item in [*reserved_seats, *direct_tickets]:
        if (
            item.origin_city_id not in city_order
            or item.destination_city_id not in city_order
        ):
            # Si no se puede ubicar el tramo, se considera ocupado todo el viaje.
            occupied.add(item.seat_id)
            continue

        taken = (
            city_order.index(item.origin_city_id),
            city_order.index(item.destination_city_id),
        )
        if segments_overlap(segment, taken):
            occupied.add(item.seat_id)

    return occupied
