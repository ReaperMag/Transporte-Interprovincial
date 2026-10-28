from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class BusGroupSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
        extra="forbid",
    )


GroupName = Annotated[str, StringConstraints(min_length=1, max_length=100)]
GroupDescription = Annotated[str, StringConstraints(max_length=255)]


class BusGroupCreate(BusGroupSchema):
    name: GroupName
    description: GroupDescription | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El nombre del grupo es obligatorio.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class BusGroupUpdate(BusGroupSchema):
    name: GroupName | None = None
    description: GroupDescription | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("El nombre del grupo no puede ser nulo.")
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El nombre del grupo es obligatorio.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class BusGroupRead(BusGroupSchema):
    id: int
    name: str
    description: str | None
    bus_count: int = Field(serialization_alias="busCount")