from unicodedata import combining, normalize

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.routes.ecuador_geography import ECUADOR_CANTONS, ECUADOR_PROVINCES
from app.modules.routes.models import City


class UnknownProvinceError(Exception):
    pass


class DuplicateCantonError(Exception):
    pass


def _normalize_name(value: str) -> str:
    decomposed = normalize("NFKD", value.casefold())
    return " ".join(
        "".join(character for character in decomposed if not combining(character)).split()
    )


def ensure_geographic_catalog(db: Session) -> int:
    existing = {
        (_normalize_name(name), _normalize_name(province))
        for name, province in db.execute(select(City.name, City.province))
    }
    new_cantons = [
        City(name=name, province=province)
        for province, names in ECUADOR_CANTONS.items()
        for name in names
        if (_normalize_name(name), _normalize_name(province)) not in existing
    ]
    if not new_cantons:
        return 0

    db.add_all(new_cantons)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return len(new_cantons)


def list_catalog_cantons(db: Session) -> list[dict[str, int | str]]:
    canonical_provinces = {
        _normalize_name(province): province for province in ECUADOR_PROVINCES
    }
    canonical_cantons = {
        (_normalize_name(province), _normalize_name(name)): name
        for province, names in ECUADOR_CANTONS.items()
        for name in names
    }
    cities = db.scalars(
        select(City).order_by(func.lower(City.province), func.lower(City.name), City.id)
    ).all()
    grouped: dict[str, dict[tuple[str, str], tuple[City, str]]] = {
        province: {} for province in ECUADOR_PROVINCES
    }

    for city in cities:
        normalized_province = _normalize_name(city.province)
        province = canonical_provinces.get(normalized_province)
        if province is None:
            continue
        normalized_name = _normalize_name(city.name)
        name = canonical_cantons.get((normalized_province, normalized_name), city.name)
        grouped[province].setdefault(
            (normalized_name, normalized_province),
            (city, name),
        )

    return [
        {"id": city.id, "name": name, "province": province}
        for province in ECUADOR_PROVINCES
        for city, name in grouped[province].values()
    ]


def create_canton(db: Session, name: str, province: str) -> City:
    canonical_province = next(
        (
            candidate
            for candidate in ECUADOR_PROVINCES
            if _normalize_name(candidate) == _normalize_name(province)
        ),
        None,
    )
    if canonical_province is None:
        raise UnknownProvinceError

    normalized_name = " ".join(name.split())
    duplicate = next(
        (
            city
            for city in db.scalars(select(City))
            if _normalize_name(city.name) == _normalize_name(normalized_name)
            and _normalize_name(city.province) == _normalize_name(canonical_province)
        ),
        None,
    )
    if duplicate is not None:
        raise DuplicateCantonError

    canton = City(name=normalized_name, province=canonical_province)
    db.add(canton)
    try:
        db.commit()
        db.refresh(canton)
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCantonError from exc
    except Exception:
        db.rollback()
        raise
    return canton
