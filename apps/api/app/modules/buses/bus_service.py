from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.buses import repository
from app.modules.buses.models import Bus, BusStatus


class DuplicateBusPlateError(Exception):
    pass


class BusNotFoundError(Exception):
    pass


class BusGroupNotFoundError(Exception):
    pass


class BusInUseError(Exception):
    pass


def _validate_group(db: Session, cooperative_id: int, group_id: int) -> None:
    if repository.get_bus_group(db, cooperative_id, group_id) is None:
        raise BusGroupNotFoundError


def _plate_exists(
    db: Session, plate: str, *, excluding_bus_id: int | None = None
) -> bool:
    from sqlalchemy import select

    statement = select(Bus.id).where(Bus.plate == plate)
    if excluding_bus_id is not None:
        statement = statement.where(Bus.id != excluding_bus_id)
    return db.scalar(statement.limit(1)) is not None


def create_bus(
    db: Session,
    cooperative_id: int,
    *,
    plate: str,
    brand: str,
    model: str,
    year: int,
    passenger_capacity: int,
    floors: int,
    origin: str,
    status: BusStatus,
    group_id: int,
) -> Bus:
    _validate_group(db, cooperative_id, group_id)
    if _plate_exists(db, plate):
        raise DuplicateBusPlateError
    bus = Bus(
        cooperative_id=cooperative_id,
        plate=plate,
        brand=brand,
        model=model,
        year=year,
        passenger_capacity=passenger_capacity,
        floors=floors,
        origin=origin,
        status=status,
        is_active=status == BusStatus.OPERATIONAL,
        group_id=group_id,
    )
    db.add(bus)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _plate_exists(db, plate):
            raise DuplicateBusPlateError from exc
        raise
    db.refresh(bus)
    return bus


def update_bus(
    db: Session,
    cooperative_id: int,
    bus_id: int,
    changes: dict[str, object],
) -> Bus:
    bus = repository.get_bus(db, cooperative_id, bus_id)
    if bus is None:
        raise BusNotFoundError
    if "group_id" in changes and changes["group_id"] is not None:
        _validate_group(db, cooperative_id, int(changes["group_id"]))
    if "plate" in changes and changes["plate"] != bus.plate and _plate_exists(
        db, str(changes["plate"]), excluding_bus_id=bus_id
    ):
        raise DuplicateBusPlateError
    for field, value in changes.items():
        setattr(bus, field, value)
    if "status" in changes:
        bus.is_active = changes["status"] == BusStatus.OPERATIONAL
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "plate" in changes and _plate_exists(
            db, str(changes["plate"]), excluding_bus_id=bus_id
        ):
            raise DuplicateBusPlateError from exc
        raise
    db.refresh(bus)
    return bus


def delete_bus(db: Session, cooperative_id: int, bus_id: int) -> None:
    bus = repository.get_bus(db, cooperative_id, bus_id)
    if bus is None:
        raise BusNotFoundError
    if repository.has_bus_relations(db, bus_id):
        raise BusInUseError
    db.delete(bus)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if repository.has_bus_relations(db, bus_id):
            raise BusInUseError from exc
        raise
