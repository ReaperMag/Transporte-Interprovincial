from unicodedata import combining, normalize

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.vehicle_catalog.catalog_data import BODYWORK_BRANDS, CHASSIS_BRANDS
from app.modules.vehicle_catalog.models import BodyworkBrand, ChassisBrand


class CatalogItemNotFoundError(Exception):
    pass


class DuplicateCatalogItemError(Exception):
    pass


def _normalize_name(value: str) -> str:
    decomposed = normalize("NFKD", value.casefold())
    return " ".join(
        "".join(character for character in decomposed if not combining(character)).split()
    )


def _create_item(db: Session, model: type[ChassisBrand] | type[BodyworkBrand], name: str):
    normalized_name = _normalize_name(name)
    existing = db.scalar(select(model).where(model.normalized_name == normalized_name))
    if existing is not None:
        raise DuplicateCatalogItemError
    item = model(name=name, normalized_name=normalized_name)
    db.add(item)
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCatalogItemError from exc
    return item


def _get_item(db: Session, model: type[ChassisBrand] | type[BodyworkBrand], item_id: int):
    item = db.get(model, item_id)
    if item is None:
        raise CatalogItemNotFoundError
    return item


def list_items(db: Session, model: type[ChassisBrand] | type[BodyworkBrand]):
    return db.scalars(select(model).order_by(func.lower(model.name), model.id)).all()


def create_item(db: Session, model: type[ChassisBrand] | type[BodyworkBrand], name: str):
    return _create_item(db, model, " ".join(name.split()))


def update_item(
    db: Session,
    model: type[ChassisBrand] | type[BodyworkBrand],
    item_id: int,
    name: str,
):
    item = _get_item(db, model, item_id)
    normalized_name = _normalize_name(name)
    duplicate = db.scalar(
        select(model).where(model.normalized_name == normalized_name, model.id != item_id)
    )
    if duplicate is not None:
        raise DuplicateCatalogItemError
    item.name = " ".join(name.split())
    item.normalized_name = normalized_name
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCatalogItemError from exc
    return item


def delete_item(
    db: Session,
    model: type[ChassisBrand] | type[BodyworkBrand],
    item_id: int,
) -> None:
    item = _get_item(db, model, item_id)
    db.delete(item)
    db.commit()


def ensure_vehicle_catalog(db: Session) -> int:
    added = 0
    for model, names in ((ChassisBrand, CHASSIS_BRANDS), (BodyworkBrand, BODYWORK_BRANDS)):
        existing = {
            item.normalized_name for item in db.scalars(select(model))
        }
        for name in names:
            normalized_name = _normalize_name(name)
            if normalized_name in existing:
                continue
            db.add(model(name=name, normalized_name=normalized_name))
            existing.add(normalized_name)
            added += 1
    if added:
        db.commit()
    return added
