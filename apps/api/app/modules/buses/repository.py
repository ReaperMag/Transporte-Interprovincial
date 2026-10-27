from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.buses.models import Bus, BusGroup


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