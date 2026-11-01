from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.modules.cooperatives.models import Cooperative
from app.modules.routes.cooperative_schemas import CooperativeRouteCreate
from app.modules.routes.models import City, Route, RouteStop, RouteType


class CooperativeNotFoundError(Exception):
    pass


class CityNotFoundError(Exception):
    pass


def list_cities(db: Session) -> list[City]:
    return list(db.scalars(select(City).order_by(City.name, City.province)).all())


def create_city(db: Session, name: str, province: str) -> City:
    normalized_name = " ".join(name.split())
    normalized_province = " ".join(province.split())
    city = db.scalar(
        select(City).where(
            func.lower(City.name) == normalized_name.casefold(),
            func.lower(City.province) == normalized_province.casefold(),
        )
    )
    if city is not None:
        return city

    city = City(name=normalized_name, province=normalized_province)
    db.add(city)
    db.commit()
    db.refresh(city)
    return city


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
    }


def list_routes(db: Session, cooperative_id: int) -> list[dict]:
    statement = (
        select(Route)
        .options(
            selectinload(Route.origin_city),
            selectinload(Route.destination_city),
            selectinload(Route.stops).selectinload(RouteStop.city),
        )
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
        db.scalars(select(City.id).where(City.id.in_(city_ids))).all()
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
    route = db.scalar(
        select(Route)
        .options(
            selectinload(Route.origin_city),
            selectinload(Route.destination_city),
            selectinload(Route.stops).selectinload(RouteStop.city),
        )
        .where(Route.id == route.id, Route.cooperative_id == cooperative_id)
    )
    return _route_read(route)