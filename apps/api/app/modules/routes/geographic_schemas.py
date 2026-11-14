from typing import Annotated

from pydantic import AfterValidator, StringConstraints

from app.modules.routes.cooperative_schemas import CityRead, ProvinceName, RouteSchema


def validate_canton_name(value: str) -> str:
    normalized = " ".join(value.split())
    if not any(character.isalpha() for character in normalized) or any(
        not character.isalnum() and character not in " .,'()-"
        for character in normalized
    ):
        raise ValueError("El nombre del cantón contiene caracteres no permitidos.")
    return normalized


CantonName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=100),
    AfterValidator(validate_canton_name),
]


class CantonCreate(RouteSchema):
    name: CantonName
    province: ProvinceName


class LocalityCreate(RouteSchema):
    name: CantonName
    province: ProvinceName
    canton: CantonName


class GeographicCatalogRead(RouteSchema):
    provinces: list[str]
    cantons: list[CityRead]
    localities: list[CityRead]
