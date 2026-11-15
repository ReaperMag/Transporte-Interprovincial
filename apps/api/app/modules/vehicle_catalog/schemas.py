from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


CatalogName = Annotated[str, StringConstraints(min_length=1, max_length=150)]
CatalogImageUrl = Annotated[str, StringConstraints(max_length=500)]
CatalogCountry = Annotated[str, StringConstraints(min_length=1, max_length=100)]
CatalogMetadata = Annotated[str, StringConstraints(min_length=1, max_length=150)]


def to_camel(value: str) -> str:
    first, *rest = value.split('_')
    return first + ''.join(part.capitalize() for part in rest)


class CatalogItemBase(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
        extra="forbid",
    )


class CatalogItemCreate(CatalogItemBase):
    name: CatalogName
    image_url: CatalogImageUrl | None = None
    origin_country: CatalogCountry | None = None
    location: CatalogMetadata | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El nombre es obligatorio.")
        return normalized

    @field_validator("image_url")
    @classmethod
    def normalize_image_url(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("origin_country", "location")
    @classmethod
    def normalize_metadata(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class CatalogItemUpdate(CatalogItemBase):
    name: CatalogName
    image_url: CatalogImageUrl | None = None
    origin_country: CatalogCountry | None = None
    location: CatalogMetadata | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El nombre es obligatorio.")
        return normalized

    @field_validator("image_url")
    @classmethod
    def normalize_image_url(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("origin_country", "location")
    @classmethod
    def normalize_metadata(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class CatalogItemRead(CatalogItemBase):
    id: int
    name: str
    image_url: str | None = Field(default=None, serialization_alias="imageUrl")
    origin_country: str | None = Field(default=None, serialization_alias="originCountry")
    location: str | None = None


class VehicleCatalogRead(BaseModel):
    chassis: list[CatalogItemRead]
    bodyworks: list[CatalogItemRead]
    bodywork_locations: list[str] = Field(serialization_alias="bodyworkLocations")
