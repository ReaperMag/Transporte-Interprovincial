from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator


CatalogName = Annotated[str, StringConstraints(min_length=1, max_length=150)]


class CatalogItemBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class CatalogItemCreate(CatalogItemBase):
    name: CatalogName

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El nombre es obligatorio.")
        return normalized


class CatalogItemUpdate(CatalogItemBase):
    name: CatalogName

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El nombre es obligatorio.")
        return normalized


class CatalogItemRead(CatalogItemBase):
    id: int
    name: str


class VehicleCatalogRead(BaseModel):
    chassis: list[CatalogItemRead]
    bodyworks: list[CatalogItemRead]
