from collections.abc import Mapping

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.cooperatives.models import Cooperative
from app.shared.base_model import Base


class CooperativeNotFoundError(Exception):
    pass


class DuplicateCooperativeError(Exception):
    pass


class CooperativeInUseError(Exception):
    pass


def create_cooperative(db: Session, values: Mapping[str, object]) -> Cooperative:
    cooperative = Cooperative(**values)
    db.add(cooperative)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCooperativeError(
            "Ya existe una cooperativa con el mismo nombre o RUC."
        ) from exc
    db.refresh(cooperative)
    return cooperative


def update_cooperative(
    db: Session,
    cooperative_id: int,
    changes: Mapping[str, object],
) -> Cooperative:
    cooperative = db.get(Cooperative, cooperative_id)
    if cooperative is None:
        raise CooperativeNotFoundError

    for field, value in changes.items():
        setattr(cooperative, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCooperativeError(
            "Ya existe una cooperativa con el mismo nombre o RUC."
        ) from exc
    db.refresh(cooperative)
    return cooperative


def delete_cooperative(db: Session, cooperative_id: int) -> None:
    cooperative = db.get(Cooperative, cooperative_id)
    if cooperative is None:
        raise CooperativeNotFoundError

    for table in Base.metadata.sorted_tables:
        if "cooperative_id" not in table.c:
            continue
        related_count = db.scalar(
            select(func.count())
            .select_from(table)
            .where(table.c.cooperative_id == cooperative_id)
        )
        if related_count:
            raise CooperativeInUseError(
                "La cooperativa tiene registros relacionados. Desactívala en lugar de eliminarla."
            )

    db.delete(cooperative)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CooperativeInUseError(
            "No se puede eliminar la cooperativa mientras existan registros relacionados."
        ) from exc