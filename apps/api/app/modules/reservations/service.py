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


# ---------------------------------------------------------------------------
# Asientos ocupados
# ---------------------------------------------------------------------------


def release_expired_reservations(db: Session) -> int:
    """
    Marca como vencidas las reservas que no se pagaron a tiempo.
    Sus asientos quedan libres para otros pasajeros.
    """
    current_time = now_local()

    pending = db.scalars(
        select(Reservation).where(
            Reservation.status == ReservationStatus.PENDING_PAYMENT,
            Reservation.expires_at.is_not(None),
        )
    ).all()

    expired = 0
    for reservation in pending:
        if as_local(reservation.expires_at) <= current_time:
            reservation.status = ReservationStatus.EXPIRED
            expired += 1

    if expired:
        db.commit()

    return expired


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


def get_trip_seats(
    db: Session,
    trip_id: int,
    origin_city_id: int,
    destination_city_id: int,
) -> TripSeatsResponse:
    """
    Devuelve el mapa de asientos del bus del viaje,
    indicando cuáles están libres para el tramo consultado.
    """
    release_expired_reservations(db)

    trip = get_bookable_trip(db, trip_id)
    segment = get_segment(trip.frequency.route, origin_city_id, destination_city_id)
    occupied = get_occupied_seat_ids(db, trip, segment)

    template: BusTemplate = trip.bus.template
    seats = sorted(
        template.seats,
        key=lambda seat: (seat.floor, seat.number),
    )

    return TripSeatsResponse(
        tripId=trip.id,
        originCityId=origin_city_id,
        destinationCityId=destination_city_id,
        busTemplateId=template.id,
        floors=template.floors,
        rows=template.rows,
        columns=template.columns,
        seats=[
            SeatAvailability(
                seatId=seat.id,
                number=seat.number,
                floor=seat.floor,
                row=seat.row,
                column=seat.column,
                seatType=seat.seat_type,
                isAvailable=seat.id not in occupied,
            )
            for seat in seats
        ],
    )


# ---------------------------------------------------------------------------
# Precio
# ---------------------------------------------------------------------------


def get_fare_price(
    db: Session,
    route_id: int,
    origin_city_id: int,
    destination_city_id: int,
    seat: TemplateSeat,
) -> Decimal:
    """Busca la tarifa del tramo según el tipo de asiento."""
    fare = db.scalar(
        select(Fare).where(
            Fare.route_id == route_id,
            Fare.origin_city_id == origin_city_id,
            Fare.destination_city_id == destination_city_id,
            Fare.seat_type == seat.seat_type,
        )
    )

    if fare is None:
        raise FareNotFoundError(
            f"No hay una tarifa registrada para el asiento {seat.number} en este tramo."
        )

    return fare.price


def calculate_discount(base_price: Decimal, passenger: Passenger) -> Decimal:
    """
    Aplica el descuento de ley solo si la categoría del pasajero
    ya fue verificada con su cédula.
    """
    if (
        passenger.category == PassengerCategory.REGULAR
        or not passenger.category_verified
    ):
        return Decimal("0.00")

    return (base_price * DISCOUNT_RATE).quantize(CENTS, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Crear reservas
# ---------------------------------------------------------------------------


def get_or_create_passenger(
    db: Session,
    data: ReservationPassengerInput,
) -> Passenger:
    """
    Reutiliza al pasajero si su cédula ya está registrada.
    Si no existe, lo registra sin cuenta, como acompañante.
    """
    passenger = get_passenger_by_id_number(db, data.idNumber)

    if passenger is not None:
        # Solo completa los datos que faltan; no reemplaza los existentes.
        if passenger.birth_date is None and data.birthDate is not None:
            passenger.birth_date = data.birthDate
        if passenger.phone is None and data.phone:
            passenger.phone = data.phone.strip()
        if passenger.email is None and data.email:
            passenger.email = data.email.strip().lower()
        return passenger

    passenger = Passenger(
        id_number=data.idNumber.upper(),
        first_name=data.firstName,
        last_name=data.lastName,
        birth_date=data.birthDate,
        phone=data.phone.strip() if data.phone else None,
        email=data.email.strip().lower() if data.email else None,
    )
    db.add(passenger)
    db.flush()

    return passenger


def create_reservation(
    db: Session,
    payload: ReservationCreate,
    *,
    buyer_account_id: int | None = None,
    sold_by: Staff | None = None,
) -> Reservation:
    """
    Aparta los asientos de un viaje para uno o varios pasajeros.

    La reserva queda pendiente de pago y vence según el tiempo
    configurado por la cooperativa. Si la vende un oficinista,
    queda registrado quién la vendió.
    """
    release_expired_reservations(db)

    trip = get_bookable_trip(db, payload.tripId)

    if sold_by is not None and sold_by.cooperative_id != trip.cooperative_id:
        raise TripNotFoundError("El viaje no pertenece a tu cooperativa.")

    route = trip.frequency.route
    segment = get_segment(route, payload.originCityId, payload.destinationCityId)
    occupied = get_occupied_seat_ids(db, trip, segment)

    template_seats = {seat.id: seat for seat in trip.bus.template.seats}

    reservation_seats: list[ReservationSeat] = []
    total = Decimal("0.00")

    for item in payload.seats:
        seat = template_seats.get(item.seatId)
        if seat is None:
            raise SeatUnavailableError("El asiento no pertenece al bus de este viaje.")

        if seat.id in occupied:
            raise SeatUnavailableError(f"El asiento {seat.number} ya está ocupado.")

        passenger = get_or_create_passenger(db, item.passenger)

        base_price = get_fare_price(
            db,
            route.id,
            payload.originCityId,
            payload.destinationCityId,
            seat,
        )
        discount = calculate_discount(base_price, passenger)
        price = base_price - discount

        reservation_seats.append(
            ReservationSeat(
                seat_id=seat.id,
                passenger_id=passenger.id,
                origin_city_id=payload.originCityId,
                destination_city_id=payload.destinationCityId,
                seat_type=seat.seat_type,
                passenger_category=passenger.category,
                base_price=base_price,
                discount_amount=discount,
                price=price,
            )
        )
        total += price

    cooperative = db.get(Cooperative, trip.cooperative_id)
    expires_at = now_local() + timedelta(
        minutes=cooperative.reservation_timeout_minutes
    )

    reservation = Reservation(
        trip_id=trip.id,
        buyer_account_id=buyer_account_id,
        sold_by_id=sold_by.id if sold_by is not None else None,
        status=ReservationStatus.PENDING_PAYMENT,
        expires_at=expires_at,
        total=total,
        seats=reservation_seats,
    )
    db.add(reservation)
    db.commit()
    db.refresh(reservation)

    return reservation


# ---------------------------------------------------------------------------
# Consultar y cancelar
# ---------------------------------------------------------------------------


def get_reservation(db: Session, reservation_id: int) -> Reservation:
    reservation = db.scalar(
        select(Reservation)
        .where(Reservation.id == reservation_id)
        .options(selectinload(Reservation.seats))
    )
    if reservation is None:
        raise ReservationNotFoundError("Reserva no encontrada.")
    return reservation


def get_reservation_cooperative_id(db: Session, reservation: Reservation) -> int:
    """Cooperativa dueña del viaje de la reserva."""
    trip = db.get(Trip, reservation.trip_id)
    return trip.cooperative_id


def list_account_reservations(db: Session, account_id: int) -> list[Reservation]:
    """Reservas hechas por un pasajero con cuenta, de la más reciente a la más antigua."""
    release_expired_reservations(db)

    return list(
        db.scalars(
            select(Reservation)
            .where(Reservation.buyer_account_id == account_id)
            .options(selectinload(Reservation.seats))
            .order_by(Reservation.created_at.desc(), Reservation.id.desc())
        ).all()
    )


def cancel_reservation(db: Session, reservation: Reservation) -> Reservation:
    """Cancela una reserva que todavía no tiene boletos emitidos."""
    release_expired_reservations(db)
    db.refresh(reservation)

    if reservation.status not in CANCELLABLE_STATUSES:
        raise ReservationNotCancellableError(
            "Solo se pueden cancelar reservas pendientes de pago o en revisión."
        )

    reservation.status = ReservationStatus.CANCELLED
    db.commit()
    db.refresh(reservation)

    return reservation


def build_reservation_read(db: Session, reservation: Reservation) -> ReservationRead:
    """Arma la respuesta de una reserva con sus asientos y pasajeros."""
    trip = db.get(Trip, reservation.trip_id)
    seats = sorted(reservation.seats, key=lambda item: item.id)
    first_seat = seats[0]

    seat_rows: list[ReservationSeatRead] = []
    for item in seats:
        template_seat = db.get(TemplateSeat, item.seat_id)
        passenger = db.get(Passenger, item.passenger_id)
        seat_rows.append(
            ReservationSeatRead(
                seatId=item.seat_id,
                seatNumber=template_seat.number,
                seatType=item.seat_type,
                passengerId=passenger.id,
                passengerIdNumber=passenger.id_number,
                passengerName=f"{passenger.first_name} {passenger.last_name}",
                passengerCategory=item.passenger_category,
                basePrice=item.base_price,
                discountAmount=item.discount_amount,
                price=item.price,
            )
        )

    return ReservationRead(
        id=reservation.id,
        tripId=reservation.trip_id,
        status=reservation.status,
        originCityId=first_seat.origin_city_id,
        destinationCityId=first_seat.destination_city_id,
        departureAt=trip.departure_at,
        expiresAt=reservation.expires_at,
        total=reservation.total,
        seats=seat_rows,
    )
