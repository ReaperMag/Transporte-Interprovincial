from collections.abc import Mapping

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.modules.accounts.models import AccountType
from app.modules.accounts.repository import create_account, get_account_by_email
from app.modules.cooperatives.models import Cooperative
from app.shared.base_model import Base


class CooperativeNotFoundError(Exception):
    pass


class DuplicateCooperativeError(Exception):
    pass


class DuplicateCooperativeAccountError(Exception):
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


def create_cooperative_with_account(
    db: Session,
    values: Mapping[str, object],
    *,
    account_email: str,
    initial_password: str,
) -> Cooperative:
    normalized_email = account_email.strip().lower()
    if get_account_by_email(db, normalized_email) is not None:
        raise DuplicateCooperativeAccountError(
            "Ya existe una cuenta con ese correo de acceso."
        )

    cooperative = Cooperative(**values)
    db.add(cooperative)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCooperativeError(
            "Ya existe una cooperativa con el mismo nombre o RUC."
        ) from exc

    try:
        create_account(
            db,
            email=normalized_email,
            password_hash=hash_password(initial_password),
            account_type=AccountType.COOPERATIVE,
            cooperative_id=cooperative.id,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCooperativeAccountError(
            "Ya existe una cuenta con ese correo de acceso."
        ) from exc
    except Exception:
        db.rollback()
        raise

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