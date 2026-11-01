from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.modules.buses.models import Bus
from app.modules.cooperatives.models import Cooperative
from app.modules.routes.models import City, Route
from app.modules.schedules.models import Frequency
from app.modules.trips.models import Trip, TripStatus


def list_cooperatives(
    db: Session,
    *,
    search: str | None = None,
) -> list[Cooperative]:
    statement = select(Cooperative)
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                Cooperative.name.ilike(pattern),
                Cooperative.ruc.ilike(pattern),
                Cooperative.email.ilike(pattern),
            )
        )
    return list(db.scalars(statement.order_by(Cooperative.name, Cooperative.id)).all())


def get_cooperative(db: Session, cooperative_id: int) -> Cooperative | None:
    return db.get(Cooperative, cooperative_id)


def get_admin_summary(db: Session) -> dict[str, int]:
    return {
        "cooperatives": db.scalar(select(func.count()).select_from(Cooperative)) or 0,
    }


def get_route_frequency_summary(db: Session, cooperative_id: int) -> dict:
    active_routes = db.scalar(
        select(func.count())
        .select_from(Route)
        .where(Route.cooperative_id == cooperative_id, Route.is_active.is_(True))
    ) or 0
    active_frequencies = (
        db.scalar(
            select(func.count())
            .select_from(Frequency)
            .join(
                Route,
                and_(
                    Route.id == Frequency.route_id,
                    Route.cooperative_id == cooperative_id,
                ),
            )
            .where(
                Frequency.cooperative_id == cooperative_id,
                Frequency.is_active.is_(True),
                Route.is_active.is_(True),
            )
        )
        or 0
    )

    origin_city = aliased(City)
    destination_city = aliased(City)
    statement = (
        select(
            Bus.id,
            Bus.number,
            Bus.plate,
            Route.id,
            origin_city.name,
            destination_city.name,
            Frequency.departure_time,
            Frequency.resolution_number,
            func.count(Trip.id),
            func.max(Trip.departure_at),
        )
        .select_from(Bus)
        .join(
            Trip,
            and_(
                Trip.bus_id == Bus.id,
                Trip.cooperative_id == cooperative_id,
                Trip.status != TripStatus.CANCELLED,
            ),
        )
        .join(
            Frequency,
            and_(
                Frequency.id == Trip.frequency_id,
                Frequency.cooperative_id == cooperative_id,
            ),
        )
        .join(
            Route,
            and_(
                Route.id == Frequency.route_id,
                Route.cooperative_id == cooperative_id,
            ),
        )
        .join(origin_city, Route.origin_city_id == origin_city.id)
        .join(destination_city, Route.destination_city_id == destination_city.id)
        .where(Bus.cooperative_id == cooperative_id)
        .group_by(
            Bus.id,
            Bus.number,
            Bus.plate,
            Route.id,
            origin_city.name,
            destination_city.name,
            Frequency.departure_time,
            Frequency.resolution_number,
        )
        .order_by(Bus.number, origin_city.name, destination_city.name, Frequency.departure_time)
    )

    assignments = [
        {
            "bus_id": row[0],
            "bus_number": row[1],
            "plate": row[2],
            "route_id": row[3],
            "origin_city": row[4],
            "destination_city": row[5],
            "departure_time": row[6].strftime("%H:%M"),
            "resolution_number": row[7],
            "trip_count": row[8],
            "last_departure_at": row[9],
        }
        for row in db.execute(statement)
    ]

    return {
        "active_routes": active_routes,
        "active_frequencies": active_frequencies,
        "bus_assignments": assignments,
    }
