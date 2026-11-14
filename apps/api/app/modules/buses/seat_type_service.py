from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.buses.models import CooperativeSeatType


class DuplicateSeatTypeNameError(Exception):
    pass


class SeatTypeNotFoundError(Exception):
    pass


def _normalize_name(name: str) -> str:
    return " ".join(name.split()).casefold()


def _name_exists(
    db: Session,
    cooperative_id: int,
    normalized_name: str,
    excluding_type_id: int | None = None,
) -> bool:
    statement = select(CooperativeSeatType.id).where(
        CooperativeSeatType.cooperative_id == cooperative_id,
        CooperativeSeatType.normalized_name == normalized_name,
    )

    if excluding_type_id is not None:
        statement = statement.where(
            CooperativeSeatType.id != excluding_type_id
        )

    return db.scalar(statement.limit(1)) is not None


def list_seat_types(
    db: Session,
    cooperative_id: int,
) -> list[CooperativeSeatType]:
    statement = (
        select(CooperativeSeatType)
        .where(
            CooperativeSeatType.cooperative_id == cooperative_id
        )
        .order_by(
            CooperativeSeatType.name,
            CooperativeSeatType.id,
        )
    )

    return list(db.scalars(statement).all())


def get_seat_type(
    db: Session,
    cooperative_id: int,
    seat_type_id: int,
) -> CooperativeSeatType | None:
    return db.scalar(
        select(CooperativeSeatType).where(
            CooperativeSeatType.id == seat_type_id,
            CooperativeSeatType.cooperative_id == cooperative_id,
        )
    )


def create_seat_type(
    db: Session,
    cooperative_id: int,
    *,
    name: str,
    percentage: Decimal,
) -> CooperativeSeatType:
    normalized = _normalize_name(name)

    if not normalized:
        raise ValueError("El nombre es obligatorio.")

    if _name_exists(db, cooperative_id, normalized):
        raise DuplicateSeatTypeNameError

    seat_type = CooperativeSeatType(
        cooperative_id=cooperative_id,
        name=name,
        percentage=percentage,
    )

    db.add(seat_type)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()

        if _name_exists(db, cooperative_id, normalized):
            raise DuplicateSeatTypeNameError from exc

        raise

    db.refresh(seat_type)
    return seat_type


def update_seat_type(
    db: Session,
    cooperative_id: int,
    seat_type_id: int,
    changes: dict[str, object],
) -> CooperativeSeatType:
    seat_type = get_seat_type(
        db, cooperative_id, seat_type_id
    )

    if seat_type is None:
        raise SeatTypeNotFoundError

    for field in changes:
        if field not in {"name", "percentage"}:
            raise ValueError("Campo no permitido.")

        if changes[field] is None:
            raise ValueError(
                "El campo no puede ser nulo."
            )

    if "name" in changes:
        name = str(changes["name"])
        normalized = _normalize_name(name)

        if not normalized:
            raise ValueError("El nombre es obligatorio.")

        if _name_exists(
            db,
            cooperative_id,
            normalized,
            excluding_type_id=seat_type_id,
        ):
            raise DuplicateSeatTypeNameError

    for field, value in changes.items():
        setattr(seat_type, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()

        if "name" in changes and _name_exists(
            db,
            cooperative_id,
            _normalize_name(str(changes["name"])),
            excluding_type_id=seat_type_id,
        ):
            raise DuplicateSeatTypeNameError from exc

        raise

    db.refresh(seat_type)
    return seat_type
