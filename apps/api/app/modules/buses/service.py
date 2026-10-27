from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.buses.group_names import normalize_group_name
from app.modules.buses.models import BusGroup
from app.modules.buses.repository import bus_group_name_exists, get_bus_group


class DuplicateBusGroupNameError(Exception):
    pass


class BusGroupNotFoundError(Exception):
    pass


def create_bus_group(
    db: Session,
    cooperative_id: int,
    *,
    name: str,
    description: str | None,
) -> BusGroup:
    normalized = normalize_group_name(name)
    if bus_group_name_exists(db, cooperative_id, normalized):
        raise DuplicateBusGroupNameError

    group = BusGroup(
        cooperative_id=cooperative_id,
        name=name,
        description=description,
    )
    db.add(group)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateBusGroupNameError from exc
    db.refresh(group)
    return group


def update_bus_group(
    db: Session,
    cooperative_id: int,
    group_id: int,
    changes: dict[str, object],
) -> BusGroup:
    group = get_bus_group(db, cooperative_id, group_id)
    if group is None:
        raise BusGroupNotFoundError

    name = changes.get("name")
    if isinstance(name, str):
        normalized = normalize_group_name(name)
        if bus_group_name_exists(
            db,
            cooperative_id,
            normalized,
            excluding_group_id=group_id,
        ):
            raise DuplicateBusGroupNameError

    for field, value in changes.items():
        setattr(group, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateBusGroupNameError from exc
    db.refresh(group)
    return group