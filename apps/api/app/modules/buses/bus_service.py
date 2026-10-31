from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.buses import repository
from app.modules.buses.models import Bus, BusPhoto, BusStatus, BusTemplate, TemplateSeat


class DuplicateBusPlateError(Exception):
    pass


class DuplicateBusNumberError(Exception):
    pass


class BusNotFoundError(Exception):
    pass


class BusGroupNotFoundError(Exception):
    pass
class BusTemplateNotFoundError(Exception):
    pass

class BusInUseError(Exception):
    pass


def _validate_group(db: Session, cooperative_id: int, group_id: int) -> None:
    if repository.get_bus_group(db, cooperative_id, group_id) is None:
        raise BusGroupNotFoundError

def _validate_template(
    db: Session, cooperative_id: int, template_id: int
) -> None:
    template = (
        db.query(BusTemplate)
        .filter(
            BusTemplate.id == template_id,
            BusTemplate.cooperative_id == cooperative_id,
        )
        .first()
    )

    if template is None:
        raise BusTemplateNotFoundError
def _plate_exists(
    db: Session, plate: str, *, excluding_bus_id: int | None = None
) -> bool:
    from sqlalchemy import select

    statement = select(Bus.id).where(Bus.plate == plate)
    if excluding_bus_id is not None:
        statement = statement.where(Bus.id != excluding_bus_id)
    return db.scalar(statement.limit(1)) is not None


def _number_exists(
    db: Session,
    cooperative_id: int,
    number: str,
    *,
    excluding_bus_id: int | None = None,
) -> bool:
    from sqlalchemy import select

    statement = select(Bus.id).where(
        Bus.cooperative_id == cooperative_id,
        Bus.number == number,
    )
    if excluding_bus_id is not None:
        statement = statement.where(Bus.id != excluding_bus_id)
    return db.scalar(statement.limit(1)) is not None


def create_bus(
    db: Session,
    cooperative_id: int,
    *,
    number: str,
    plate: str,
    brand: str,
    model: str,
    year: int,
    passenger_capacity: int,
    floors: int,
    origin: str,
    status: BusStatus,
    group_id: int,
    template_id: int | None,
    template: dict[str, object] | None,
    photo_paths: list[str] | None = None,
) -> Bus:
    if (template_id is None) == (template is None):
        raise ValueError("Debe proporcionarse exactamente una plantilla.")
    _validate_group(db, cooperative_id, group_id)
    if template_id is not None:
        _validate_template(db, cooperative_id, template_id)
    if _number_exists(db, cooperative_id, number):
        raise DuplicateBusNumberError
    if _plate_exists(db, plate):
        raise DuplicateBusPlateError

    try:
        if template is not None:
            bus_template = BusTemplate(
                cooperative_id=cooperative_id,
                name=str(template["name"]),
                floors=int(template["floors"]),
                has_bathroom=bool(template["has_bathroom"]),
                rows=int(template["rows"]),
                columns=int(template["columns"]),
            )
            db.add(bus_template)
            db.flush()
            template_id = bus_template.id
            for seat in template["seats"]:
                db.add(
                    TemplateSeat(
                        template_id=template_id,
                        number=seat["number"],
                        floor=seat["floor"],
                        row=seat["row"],
                        column=seat["column"],
                        seat_type=seat["seat_type"],
                    )
                )

        bus = Bus(
            cooperative_id=cooperative_id,
            number=number,
            plate=plate,
            chassis_brand=brand,
            body_brand=brand,
            brand=brand,
            model=model,
            year=year,
            passenger_capacity=passenger_capacity,
            floors=floors,
            origin=origin,
            status=status,
            is_active=status == BusStatus.OPERATIONAL,
            group_id=group_id,
            template_id=template_id,
        )
        db.add(bus)
        db.flush()
        for file_path in photo_paths or []:
            db.add(BusPhoto(bus_id=bus.id, file_path=file_path))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _number_exists(db, cooperative_id, number):
            raise DuplicateBusNumberError from exc
        if _plate_exists(db, plate):
            raise DuplicateBusPlateError from exc
        raise
    except Exception:
        db.rollback()
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
    if "template_id" in changes:
        if changes["template_id"] is None:
            raise ValueError("La plantilla no puede ser nula.")

        _validate_template(
            db,
            cooperative_id,
            int(changes["template_id"]),
        )
    if "group_id" in changes and changes["group_id"] is not None:
        _validate_group(db, cooperative_id, int(changes["group_id"]))
    if "number" in changes and changes["number"] != bus.number and _number_exists(
        db, cooperative_id, str(changes["number"]), excluding_bus_id=bus_id
    ):
        raise DuplicateBusNumberError
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
        if "number" in changes and _number_exists(
            db, cooperative_id, str(changes["number"]), excluding_bus_id=bus_id
        ):
            raise DuplicateBusNumberError from exc
        if "plate" in changes and _plate_exists(
            db, str(changes["plate"]), excluding_bus_id=bus_id
        ):
            raise DuplicateBusPlateError from exc
        raise
    db.refresh(bus)
    return bus


def update_bus_status(
    db: Session, cooperative_id: int, bus_id: int, status: BusStatus
) -> Bus:
    return update_bus(db, cooperative_id, bus_id, {"status": status})


def delete_bus(db: Session, cooperative_id: int, bus_id: int) -> None:
    bus = repository.get_bus(db, cooperative_id, bus_id)
    if bus is None:
        raise BusNotFoundError
    if not repository.can_delete_bus(db, bus_id):
        raise BusInUseError
    db.delete(bus)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if repository.has_bus_relations(db, bus_id):
            raise BusInUseError from exc
        raise
