"""Seed the fares of the active routes that do not have them yet.

Usage (from apps/api):
    python scripts/seed.py

The fare of a segment is set per seat type: every seat type available on the
buses that serve the route gets its own price. Existing fares are never
overwritten, so prices edited by hand are preserved when the script runs again.
"""

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session, selectinload  # noqa: E402

from app.core.database import SessionLocal, init_db  # noqa: E402
from app.modules.buses.models import Bus, SeatType, TemplateSeat  # noqa: E402
from app.modules.routes.models import City, Fare, Route, RouteStop  # noqa: E402
from app.modules.schedules.models import Frequency  # noqa: E402
from app.modules.trips.models import Trip  # noqa: E402

# Tarifa normal de referencia por tramo completo (base ANT). El resto de tramos
# se calcula por duración.
REFERENCE_FARES: dict[frozenset[str], Decimal] = {
    frozenset(("Ambato", "Quito")): Decimal("4.50"),
    frozenset(("Ambato", "Riobamba")): Decimal("2.00"),
}
VIP_SURCHARGE = Decimal("1.40")
FALLBACK_PRICE_PER_HOUR = Decimal("1.25")
MIN_FARE = Decimal("1.00")


def normal_price(origin: str, destination: str, duration_minutes: int | None) -> Decimal:
    reference = REFERENCE_FARES.get(frozenset((origin, destination)))
    if reference is not None:
        return reference

    hours = Decimal(duration_minutes or 60) / Decimal(60)
    return max(MIN_FARE, (hours * FALLBACK_PRICE_PER_HOUR).quantize(Decimal("0.01")))


def price_for(seat_type: SeatType, normal_fare: Decimal) -> Decimal:
    if seat_type is SeatType.VIP:
        return (normal_fare * VIP_SURCHARGE).quantize(Decimal("0.01"))
    return normal_fare


def seat_types_by_route(db: Session) -> dict[int, set[SeatType]]:
    """Seat types of the buses assigned to the trips of each route."""
    rows = db.execute(
        select(Frequency.route_id, TemplateSeat.seat_type)
        .select_from(Trip)
        .join(Frequency, Trip.frequency_id == Frequency.id)
        .join(Bus, Trip.bus_id == Bus.id)
        .join(TemplateSeat, TemplateSeat.template_id == Bus.template_id)
        .distinct()
    ).all()

    seat_types: dict[int, set[SeatType]] = {}
    for route_id, seat_type in rows:
        seat_types.setdefault(route_id, set()).add(seat_type)
    return seat_types


def route_segments(route: Route) -> list[tuple[City, City]]:
    cities = [route.origin_city, *(stop.city for stop in route.stops), route.destination_city]
    return [
        (cities[index], cities[target])
        for index in range(len(cities))
        for target in range(index + 1, len(cities))
    ]


def main() -> None:
    init_db()

    with SessionLocal() as db:
        routes = db.scalars(
            select(Route)
            .where(Route.is_active.is_(True))
            .order_by(Route.id)
            .options(
                selectinload(Route.origin_city),
                selectinload(Route.destination_city),
                selectinload(Route.stops).selectinload(RouteStop.city),
            )
        ).all()

        seat_types = seat_types_by_route(db)
        existing = {
            (fare.route_id, fare.origin_city_id, fare.destination_city_id, fare.seat_type)
            for fare in db.scalars(select(Fare))
        }

        created = 0
        routes_without_trips = 0

        for route in routes:
            route_seat_types = seat_types.get(route.id)
            if not route_seat_types:
                routes_without_trips += 1
                continue

            for seat_type in sorted(route_seat_types, key=lambda value: value.value):
                for origin, destination in route_segments(route):
                    key = (route.id, origin.id, destination.id, seat_type)
                    if key in existing:
                        continue

                    base_price = normal_price(
                        origin.name,
                        destination.name,
                        route.duration_minutes,
                    )
                    db.add(
                        Fare(
                            route_id=route.id,
                            origin_city_id=origin.id,
                            destination_city_id=destination.id,
                            seat_type=seat_type,
                            price=price_for(seat_type, base_price),
                        )
                    )
                    existing.add(key)
                    created += 1

        db.commit()

    print(f"Tarifas creadas: {created}.")
    if routes_without_trips:
        print(f"Rutas sin viajes (sin tarifas): {routes_without_trips}.")

    if not created:
        print("No había tarifas pendientes de sembrar.")


if __name__ == "__main__":
    main()
