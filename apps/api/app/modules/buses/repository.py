from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.buses.models import Bus, BusGroup
from app.modules.schedules.models import RouteSheet


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