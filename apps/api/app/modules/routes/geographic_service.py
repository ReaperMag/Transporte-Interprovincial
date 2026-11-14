from unicodedata import combining, normalize

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.routes.ecuador_geography import ECUADOR_CANTONS, ECUADOR_PROVINCES
from app.modules.routes.ecuador_localities import ECUADOR_LOCALITIES
from app.modules.routes.models import City


class UnknownProvinceError(Exception):
    pass


class DuplicateCantonError(Exception):
    pass


class UnknownCantonError(Exception):
    pass


class DuplicateLocalityError(Exception):
    pass


def _normalize_name(value: str) -> str:
    decomposed = normalize("NFKD", value.casefold())
    return " ".join(
        "".join(character for character in decomposed if not combining(character)).split()
    )


def ensure_geographic_catalog(db: Session) -> int:
    existing = {
        (
            _normalize_name(city.name),
            _normalize_name(city.province),
            _normalize_name(city.canton),
        ): city
        for city in db.scalars(select(City))
    }
    expected_locations = [
        (name, province, "")
        for province, names in ECUADOR_CANTONS.items()
        for name in names
    ] + [
        (name, province, canton)
        for province, cantons in ECUADOR_LOCALITIES.items()
        for canton, names in cantons.items()
        for name in names
    ]
    added_count = 0
    has_updates = False
    new_locations: list[City] = []
    for name, province, canton in expected_locations:
        key = (
            _normalize_name(name),
            _normalize_name(province),
            _normalize_name(canton or ""),
        )
        current = existing.get(key)
        if current is not None:
            if not current.is_catalogued:
                current.is_catalogued = True
                has_updates = True
            continue
        location = City(
            name=name,
            province=province,
            canton=canton,
            is_catalogued=True,
        )
        new_locations.append(location)
        existing[key] = location
        added_count += 1

    if not new_locations and not has_updates:
        return 0

    db.add_all(new_locations)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return added_count


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
        select(City)
        .where(City.is_catalogued.is_(True), City.canton == "")
        .order_by(func.lower(City.province), func.lower(City.name), City.id)
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


def list_catalog_localities(db: Session) -> list[dict[str, int | str]]:
    return [
        {
            "id": city.id,
            "name": city.name,
            "province": city.province,
            "canton": city.canton,
        }
        for city in db.scalars(
            select(City)
            .where(City.is_catalogued.is_(True), City.canton != "")
            .order_by(
                func.lower(City.province),
                func.lower(City.canton),
                func.lower(City.name),
                City.id,
            )
        )
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
            and not city.canton
        ),
        None,
    )
    if duplicate is not None:
        raise DuplicateCantonError

    canton = City(
        name=normalized_name,
        province=canonical_province,
        canton="",
        is_catalogued=True,
    )
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


def create_locality(db: Session, name: str, province: str, canton: str) -> City:
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

    canonical_canton = next(
        (
            city.name
            for city in db.scalars(
                select(City).where(
                    City.is_catalogued.is_(True),
                    City.canton == "",
                    City.province == canonical_province,
                )
            )
            if _normalize_name(city.name) == _normalize_name(canton)
        ),
        None,
    )
    if canonical_canton is None:
        raise UnknownCantonError

    normalized_name = " ".join(name.split())
    duplicate = next(
        (
            city
            for city in db.scalars(select(City))
            if _normalize_name(city.name) == _normalize_name(normalized_name)
            and _normalize_name(city.province) == _normalize_name(canonical_province)
            and _normalize_name(city.canton) == _normalize_name(canonical_canton)
        ),
        None,
    )
    if duplicate is not None:
        if duplicate.is_catalogued:
            raise DuplicateLocalityError
        duplicate.is_catalogued = True
        try:
            db.commit()
            db.refresh(duplicate)
        except Exception:
            db.rollback()
            raise
        return duplicate

    locality = City(
        name=normalized_name,
        province=canonical_province,
        canton=canonical_canton,
        is_catalogued=True,
    )
    db.add(locality)
    try:
        db.commit()
        db.refresh(locality)
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateLocalityError from exc
    except Exception:
        db.rollback()
        raise
    return locality
