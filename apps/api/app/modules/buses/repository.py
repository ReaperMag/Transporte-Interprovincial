from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.buses.models import Bus, BusGroup
from app.modules.schedules.models import RouteSheet
from app.modules.staff.models import Staff
from app.modules.trips.models import Trip
from app.modules.schedules.models import route_sheet_standby_buses


def list_bus_groups(
    db: Session,
    cooperative_id: int,
) -> list[tuple[BusGroup, int]]:
    statement = (
        select(BusGroup, func.count(Bus.id))
        .outerjoin(Bus, Bus.group_id == BusGroup.id)
        .where(BusGroup.cooperative_id == cooperative_id)
        .group_by(BusGroup.id)
        .order_by(BusGroup.name, BusGroup.id)
    )
    return list(db.execute(statement).all())


def get_bus_group(
    db: Session,
    cooperative_id: int,
    group_id: int,
) -> BusGroup | None:
    return db.scalar(
        select(BusGroup).where(
            BusGroup.id == group_id,
            BusGroup.cooperative_id == cooperative_id,
        )
    )


def count_group_buses(db: Session, group_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Bus).where(Bus.group_id == group_id)
    ) or 0


def has_group_route_sheets(db: Session, group_id: int) -> bool:
    return db.scalar(
        select(RouteSheet.id).where(RouteSheet.bus_group_id == group_id).limit(1)
    ) is not None


def bus_group_name_exists(
    db: Session,
    cooperative_id: int,
    normalized_name: str,
    *,
    excluding_group_id: int | None = None,
) -> bool:
    statement = select(BusGroup.id).where(
        BusGroup.cooperative_id == cooperative_id,
        BusGroup.normalized_name == normalized_name,
    )
    if excluding_group_id is not None:
        statement = statement.where(BusGroup.id != excluding_group_id)
    return db.scalar(statement.limit(1)) is not None


def list_buses(
    db: Session,
    cooperative_id: int,
    *,
    plate: str | None = None,
    group_id: int | None = None,
    status: str | None = None,
) -> list[Bus]:
    statement = (
        select(Bus)
        .join(BusGroup, Bus.group_id == BusGroup.id)
        .where(Bus.cooperative_id == cooperative_id, BusGroup.cooperative_id == cooperative_id)
        .order_by(Bus.plate, Bus.id)
    )
    if plate:
        statement = statement.where(Bus.plate.ilike(f"%{plate}%"))
    if group_id is not None:
        statement = statement.where(Bus.group_id == group_id)
    if status is not None:
        statement = statement.where(Bus.status == status)
    return list(db.scalars(statement).all())


def get_bus(db: Session, cooperative_id: int, bus_id: int) -> Bus | None:
    return db.scalar(
        select(Bus).where(Bus.id == bus_id, Bus.cooperative_id == cooperative_id)
    )


def has_bus_relations(db: Session, bus_id: int) -> bool:
    return (
        db.scalar(select(Trip.id).where(Trip.bus_id == bus_id).limit(1)) is not None
        or db.scalar(
            select(route_sheet_standby_buses.c.bus_id)
            .where(route_sheet_standby_buses.c.bus_id == bus_id)
            .limit(1)
        )


def can_delete_bus(db: Session, bus_id: int) -> bool:
        """Keep buses referenced by historical trips or operational assignments."""
        return not has_bus_relations(db, bus_id)
        is not None
        or db.scalar(select(Staff.id).where(Staff.assigned_bus_id == bus_id).limit(1))
        is not None
    )