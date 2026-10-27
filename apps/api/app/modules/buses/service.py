from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.buses.group_names import normalize_group_name
from app.modules.buses.models import BusGroup
from app.modules.buses.repository import (
    bus_group_name_exists,
    count_group_buses,
    get_bus_group,
    has_group_route_sheets,
)


class DuplicateBusGroupNameError(Exception):
    pass


class BusGroupNotFoundError(Exception):
    pass


class BusGroupInUseError(Exception):
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
        if bus_group_name_exists(db, cooperative_id, normalized):
            raise DuplicateBusGroupNameError from exc
        raise
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
        if isinstance(name, str) and bus_group_name_exists(
            db,
            cooperative_id,
            normalize_group_name(name),
            excluding_group_id=group_id,
        ):
            raise DuplicateBusGroupNameError from exc
        raise
    db.refresh(group)
    return group


def delete_bus_group(
    db: Session,
    cooperative_id: int,
    group_id: int,
) -> None:
    group = get_bus_group(db, cooperative_id, group_id)
    if group is None:
        raise BusGroupNotFoundError
    if count_group_buses(db, group_id) or has_group_route_sheets(db, group_id):
        raise BusGroupInUseError

    db.delete(group)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if count_group_buses(db, group_id) or has_group_route_sheets(db, group_id):
            raise BusGroupInUseError from exc
        raise