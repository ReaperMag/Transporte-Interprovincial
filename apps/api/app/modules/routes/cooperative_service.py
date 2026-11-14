from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.cooperatives.models import Cooperative
from app.modules.routes.cooperative_schemas import (
    CooperativeRouteCreate,
    RouteFareSave,
)
from app.modules.routes.models import City, Fare, Route, RouteStop, RouteType


class CooperativeNotFoundError(Exception):
    pass


class CityNotFoundError(Exception):
    pass


class RouteNotFoundError(Exception):
    pass


class FareSegmentError(Exception):
    pass


def list_cities(db: Session) -> list[City]:
    return list(db.scalars(select(City).order_by(City.name, City.province)).all())


def _route_read(route: Route) -> dict:
    return {
        "id": route.id,
        "origin_city_id": route.origin_city_id,
        "origin_city": route.origin_city.name,
        "origin_province": route.origin_city.province,
        "destination_city_id": route.destination_city_id,
        "destination_city": route.destination_city.name,
        "destination_province": route.destination_city.province,
        "duration_minutes": route.duration_minutes,
        "route_type": route.route_type,
        "is_active": route.is_active,
        "stops": [
            {
                "city_id": stop.city_id,
                "city_name": stop.city.name,
                "province": stop.city.province,
                "stop_order": stop.stop_order,
                "minutes_from_origin": stop.minutes_from_origin,
            }
            for stop in route.stops
        ],
        "fares": [
            {
                "origin_city_id": fare.origin_city_id,
                "destination_city_id": fare.destination_city_id,
                "seat_type": fare.seat_type,
                "price": fare.price,
            }
            for fare in sorted(
                route.fares,
                key=lambda item: (
                    item.origin_city_id,
                    item.destination_city_id,
                    item.seat_type.value,
                ),
            )
        ],
    }


def _route_options() -> tuple:
    return (
        selectinload(Route.origin_city),
        selectinload(Route.destination_city),
        selectinload(Route.stops).selectinload(RouteStop.city),
        selectinload(Route.fares),
    )


def _route_query(route_id: int, cooperative_id: int):
    return (
        select(Route)
        .options(*_route_options())
        .where(Route.id == route_id, Route.cooperative_id == cooperative_id)
    )


def _segment_keys(route: Route) -> set[tuple[int, int]]:
    """Pares ordenados de ciudades que forman tramos válidos de la ruta."""
    cities = [
        route.origin_city_id,
        *(stop.city_id for stop in sorted(route.stops, key=lambda item: item.stop_order)),
        route.destination_city_id,
    ]
    return {
        (cities[origin], cities[destination])
        for origin in range(len(cities))
        for destination in range(origin + 1, len(cities))
    }


def list_routes(db: Session, cooperative_id: int) -> list[dict]:
    statement = (
        select(Route)
        .options(*_route_options())
        .where(Route.cooperative_id == cooperative_id)
        .order_by(Route.is_active.desc(), Route.id)
    )
    return [_route_read(route) for route in db.scalars(statement).all()]


def create_route(
    db: Session,
    cooperative_id: int,
    payload: CooperativeRouteCreate,
) -> dict:
    if db.get(Cooperative, cooperative_id) is None:
        raise CooperativeNotFoundError
    city_ids = {
        payload.origin_city_id,
        payload.destination_city_id,
        *(stop.city_id for stop in payload.stops),
    }
    found_city_ids = set(
        db.scalars(
            select(City.id).where(
                City.id.in_(city_ids),
                City.is_catalogued.is_(True),
                City.canton != "",
            )
        ).all()
    )
    if found_city_ids != city_ids:
        raise CityNotFoundError

    route = Route(
        cooperative_id=cooperative_id,
        origin_city_id=payload.origin_city_id,
        destination_city_id=payload.destination_city_id,
        route_type=RouteType.WITH_STOPS if payload.stops else RouteType.DIRECT,
        duration_minutes=payload.duration_minutes,
        stops=[
            RouteStop(
                city_id=stop.city_id,
                stop_order=index,
                minutes_from_origin=stop.minutes_from_origin,
            )
            for index, stop in enumerate(payload.stops, start=1)
        ],
    )
    db.add(route)
    db.commit()
    route = db.scalar(_route_query(route.id, cooperative_id))
    return _route_read(route)


def save_route_fares(
    db: Session,
    cooperative_id: int,
    route_id: int,
    payload: RouteFareSave,
) -> dict:
    route = db.scalar(_route_query(route_id, cooperative_id))
    if route is None:
        raise RouteNotFoundError

    valid_segments = _segment_keys(route)
    for fare in payload.fares:
        if (fare.origin_city_id, fare.destination_city_id) not in valid_segments:
            raise FareSegmentError(
                "Una tarifa usa un tramo que no pertenece a la ruta."
            )

    existing = {
        (fare.origin_city_id, fare.destination_city_id, fare.seat_type): fare
        for fare in route.fares
    }

    for fare in payload.fares:
        key = (fare.origin_city_id, fare.destination_city_id, fare.seat_type)
        current = existing.get(key)
        if current is None:
            db.add(
                Fare(
                    route_id=route.id,
                    origin_city_id=fare.origin_city_id,
                    destination_city_id=fare.destination_city_id,
                    seat_type=fare.seat_type,
                    price=fare.price,
                )
            )
        else:
            current.price = fare.price

    db.commit()

    route = db.scalar(_route_query(route_id, cooperative_id))
    return _route_read(route)