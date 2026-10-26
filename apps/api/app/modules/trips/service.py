from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, aliased

from app.modules.buses.models import Bus
from app.modules.cooperatives.models import Cooperative
from app.modules.routes.models import City, Fare, Route
from app.modules.schedules.models import (
    Frequency,
    RouteSheet,
    RouteSheetStatus,
)
from app.modules.trips.models import Trip, TripStatus
from app.modules.trips.schemas import (
    CityOption,
    TripFareOption,
    TripSearchResult,
)


ECUADOR_TIMEZONE = ZoneInfo("America/Guayaquil")


def get_cities(db: Session) -> list[CityOption]:
    """
    Obtiene las ciudades registradas para utilizarlas
    en los filtros de búsqueda.
    """
    statement = select(City).order_by(
        City.name,
        City.province,
    )

    cities = db.scalars(statement).all()

    return [
        CityOption(
            id=city.id,
            name=city.name,
            province=city.province,
        )
        for city in cities
    ]


def search_trips(
    db: Session,
    origin_city_id: int,
    destination_city_id: int,
    travel_date: date,
) -> list[TripSearchResult]:
    """
    Busca viajes programados para una ruta completa
    y una fecha determinada.

    Solo devuelve viajes con tarifas registradas.
    No calcula todavía disponibilidad de asientos.
    """

    start_of_day = datetime.combine(
        travel_date,
        time.min,
        tzinfo=ECUADOR_TIMEZONE,
    )

    end_of_day = start_of_day + timedelta(days=1)

    current_time = datetime.now(ECUADOR_TIMEZONE)

    # No consultar viajes de fechas que ya terminaron.
    if end_of_day <= current_time:
        return []

    search_start = max(start_of_day, current_time)

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
        .join(
            Fare,
            and_(
                Fare.route_id == Route.id,
                Fare.origin_city_id == origin_city_id,
                Fare.destination_city_id == destination_city_id,
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
            Trip.departure_at >= search_start,
            Trip.departure_at < end_of_day,

            Route.origin_city_id == origin_city_id,
            Route.destination_city_id == destination_city_id,

            Frequency.is_active.is_(True),
            Route.is_active.is_(True),
            Bus.is_active.is_(True),
            Cooperative.is_active.is_(True),

            # Mantener las relaciones dentro de la
            # cooperativa correspondiente.
            Trip.cooperative_id == Frequency.cooperative_id,
            Trip.cooperative_id == Route.cooperative_id,
            Trip.cooperative_id == Bus.cooperative_id,

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

    rows = db.execute(statement).all()

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

                fares=[],
            )

        results[trip.id].fares.append(
            TripFareOption(
                seatType=fare.seat_type,
                price=fare.price,
            )
        )

    return list(results.values())