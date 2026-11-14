from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select, union
from sqlalchemy.orm import Session, aliased

from app.modules.buses.models import Bus, TemplateSeat
from app.modules.cooperatives.models import Cooperative
from app.modules.reservations.models import (
    Reservation,
    ReservationSeat,
    ReservationStatus,
)
from app.modules.routes.models import City, Fare, Route, RouteStop
from app.modules.schedules.models import (
    Frequency,
    RouteSheet,
    RouteSheetStatus,
)
from app.modules.tickets.models import Ticket, TicketStatus
from app.modules.trips.models import Trip, TripStatus
from app.modules.trips.schemas import (
    CityOption,
    TripFareOption,
    TripSearchResult,
)


ECUADOR_TIMEZONE = ZoneInfo("America/Guayaquil")


def as_local(value: datetime) -> datetime:
    """Convierte o asegura que una fecha esté en la zona horaria de Ecuador."""
    if value.tzinfo is None:
        return value.replace(tzinfo=ECUADOR_TIMEZONE)
    return value.astimezone(ECUADOR_TIMEZONE)


def get_cities(db: Session) -> list[CityOption]:
    """
    Obtiene las ciudades registradas para utilizarlas
    en los filtros de búsqueda.
    """
    route_city_ids = union(
        select(Route.origin_city_id.label("city_id")).where(Route.is_active.is_(True)),
        select(Route.destination_city_id.label("city_id")).where(Route.is_active.is_(True)),
        select(RouteStop.city_id.label("city_id"))
        .join(Route, RouteStop.route_id == Route.id)
        .where(Route.is_active.is_(True)),
    )
    statement = (
        select(City)
        .where(
            or_(
                and_(City.is_catalogued.is_(True), City.canton != ""),
                City.id.in_(route_city_ids),
            )
        )
        .order_by(City.name, City.canton, City.province)
    )

    cities = db.scalars(statement).all()

    return [
        CityOption(
            id=city.id,
            name=city.name,
            province=city.province,
            canton=city.canton or None,
        )
        for city in cities
    ]


def get_cities_for_cooperative(db: Session, cooperative_id: int) -> list[CityOption]:
    route_city_ids = set(
        db.scalars(
            select(Route.origin_city_id).where(
                Route.cooperative_id == cooperative_id,
                Route.is_active.is_(True),
            )
        ).all()
    )
    route_city_ids.update(
        db.scalars(
            select(Route.destination_city_id).where(
                Route.cooperative_id == cooperative_id,
                Route.is_active.is_(True),
            )
        ).all()
    )
    if not route_city_ids:
        return []
    return [
        CityOption(
            id=city.id,
            name=city.name,
            province=city.province,
            canton=city.canton or None,
        )
        for city in db.scalars(
            select(City)
            .where(City.id.in_(route_city_ids))
            .order_by(City.name, City.province)
        ).all()
    ]


def search_trips(
    db: Session,
    origin_city_id: int | None = None,
    destination_city_id: int | None = None,
    travel_date: date | None = None,
    end_date: date | None = None,
    include_past: bool = False,
    cooperative_id: int | None = None,
) -> list[TripSearchResult]:
    """
    Busca los viajes programados.

    Sin filtros devuelve todos los viajes disponibles. El origen, el destino
    y el rango de fechas son opcionales y sirven para acotar la búsqueda.
    Si include_past es True, incluye también viajes que ya salieron marcando isPast=True.

    Solo devuelve viajes con tarifas registradas.
    No calcula todavía disponibilidad de asientos.
    """

    current_time = datetime.now(ECUADOR_TIMEZONE)
    search_start = None if include_past else current_time
    search_end = None

    if travel_date is not None:
        start_of_day = datetime.combine(
            travel_date,
            time.min,
            tzinfo=ECUADOR_TIMEZONE,
        )
        if end_date is not None:
            search_end = datetime.combine(
                end_date + timedelta(days=1),
                time.min,
                tzinfo=ECUADOR_TIMEZONE,
            )
        else:
            search_end = start_of_day + timedelta(days=1)

        if not include_past:
            # No consultar viajes de fechas que ya terminaron si no se incluyen pasados.
            if search_end <= current_time:
                return []
            search_start = max(start_of_day, current_time)
        else:
            search_start = start_of_day
    elif end_date is not None:
        search_end = datetime.combine(
            end_date + timedelta(days=1),
            time.min,
            tzinfo=ECUADOR_TIMEZONE,
        )

    origin_city = aliased(City)
    destination_city = aliased(City)

    statement = (
        select(
            Trip,
            Route,
            Bus,
            Cooperative,
            origin_city,
            destination_city,
            Fare,
        )
        .select_from(Trip)
        .join(
            Frequency,
            Trip.frequency_id == Frequency.id,
        )
        .join(
            Route,
            Frequency.route_id == Route.id,
        )
        .join(
            Bus,
            Trip.bus_id == Bus.id,
        )
        .join(
            Cooperative,
            Trip.cooperative_id == Cooperative.id,
        )
        .join(
            origin_city,
            Route.origin_city_id == origin_city.id,
        )
        .join(
            destination_city,
            Route.destination_city_id == destination_city.id,
        )
        .outerjoin(
            Fare,
            # Tarifas del recorrido completo de la ruta.
            and_(
                Fare.route_id == Route.id,
                Fare.origin_city_id == Route.origin_city_id,
                Fare.destination_city_id == Route.destination_city_id,
            ),
        )
        .outerjoin(
            RouteSheet,
            and_(
                Trip.route_sheet_id == RouteSheet.id,
                RouteSheet.cooperative_id == Trip.cooperative_id,
            ),
        )
        .where(
            Trip.status == TripStatus.SCHEDULED,

            Frequency.is_active.is_(True),
            Route.is_active.is_(True),
            Bus.is_active.is_(True),
            Cooperative.is_active.is_(True),

            # Mantener las relaciones dentro de la
            # cooperativa correspondiente.
            Trip.cooperative_id == Frequency.cooperative_id,
            Trip.cooperative_id == Route.cooperative_id,
            Trip.cooperative_id == Bus.cooperative_id,
            *(
                (Trip.cooperative_id == cooperative_id,)
                if cooperative_id is not None
                else ()
            ),

            # Si tiene hoja de ruta, debe estar publicada.
            or_(
                Trip.route_sheet_id.is_(None),
                RouteSheet.status == RouteSheetStatus.PUBLISHED,
            ),
        )
        .order_by(
            Trip.departure_at,
            Trip.id,
            Fare.price,
        )
    )

    if search_start is not None:
        statement = statement.where(Trip.departure_at >= search_start)
    if search_end is not None:
        statement = statement.where(Trip.departure_at < search_end)
    if origin_city_id is not None:
        statement = statement.where(Route.origin_city_id == origin_city_id)
    if destination_city_id is not None:
        statement = statement.where(Route.destination_city_id == destination_city_id)

    rows = db.execute(statement).all()

    trip_ids = [trip.id for trip, *_ in rows]
    occupied_by_trip: dict[int, set[int]] = {}
    capacities_by_trip: dict[int, int] = {}

    if trip_ids:
        # Calcular capacidad total de cada viaje
        cap_statement = (
            select(Trip.id, func.count(TemplateSeat.id))
            .join(Bus, Trip.bus_id == Bus.id)
            .join(TemplateSeat, TemplateSeat.template_id == Bus.template_id)
            .where(Trip.id.in_(trip_ids))
            .group_by(Trip.id)
        )
        capacities_by_trip = dict(db.execute(cap_statement).all())

        # Calcular asientos ocupados por reservas activas
        res_statement = (
            select(Reservation.trip_id, ReservationSeat.seat_id)
            .join(ReservationSeat, ReservationSeat.reservation_id == Reservation.id)
            .where(
                Reservation.trip_id.in_(trip_ids),
                Reservation.status.in_(
                    (
                        ReservationStatus.PENDING_PAYMENT,
                        ReservationStatus.PAYMENT_REVIEW,
                        ReservationStatus.CONFIRMED,
                    )
                ),
            )
        )
        for r_trip_id, seat_id in db.execute(res_statement).all():
            occupied_by_trip.setdefault(r_trip_id, set()).add(seat_id)

        # Asientos ocupados por boletos directos
        ticket_statement = (
            select(Ticket.trip_id, Ticket.seat_id)
            .where(
                Ticket.trip_id.in_(trip_ids),
                Ticket.reservation_seat_id.is_(None),
                Ticket.status != TicketStatus.CANCELLED,
            )
        )
        for t_trip_id, seat_id in db.execute(ticket_statement).all():
            occupied_by_trip.setdefault(t_trip_id, set()).add(seat_id)

    results: dict[int, TripSearchResult] = {}

    for (
        trip,
        route,
        bus,
        cooperative,
        origin,
        destination,
        fare,
    ) in rows:

        if trip.id not in results:
            departure_local = as_local(trip.departure_at)
            total_seats = capacities_by_trip.get(trip.id, 0)
            occupied_count = len(occupied_by_trip.get(trip.id, set()))
            available_seats = max(0, total_seats - occupied_count)

            results[trip.id] = TripSearchResult(
                tripId=trip.id,
                routeId=route.id,

                cooperativeId=cooperative.id,
                cooperativeName=cooperative.name,

                originCityId=origin.id,
                originCityName=origin.name,

                destinationCityId=destination.id,
                destinationCityName=destination.name,

                departureAt=trip.departure_at,
                durationMinutes=route.duration_minutes,

                busId=bus.id,
                busNumber=bus.number,
                busTemplateId=bus.template_id,

                isPast=departure_local <= current_time,
                totalSeats=total_seats,
                availableSeats=available_seats,

                fares=[],
            )

        if fare is not None:
            results[trip.id].fares.append(
                TripFareOption(
                    seatType=fare.seat_type,
                    price=fare.price,
                )
            )

    return list(results.values())