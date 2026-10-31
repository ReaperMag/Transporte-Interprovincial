from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.modules.buses.models import BusOrigin, BusStatus

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


BusText = Annotated[str, StringConstraints(min_length=1, max_length=50)]
BusPlate = Annotated[str, StringConstraints(min_length=3, max_length=10)]
BusNumber = Annotated[str, StringConstraints(min_length=1, max_length=10)]


class BusCreate(BusGroupSchema):
    number: BusNumber
    plate: BusPlate
    template_id: int = Field(gt=0,validation_alias="templateId", serialization_alias="templateId")
    brand: BusText
    model: BusText
    year: int = Field(ge=1950, le=date.today().year + 1)
    passenger_capacity: int = Field(
        ge=1, le=200, validation_alias="capacity", serialization_alias="capacity"
    )
    floors: Literal[2] = 2
    origin: BusOrigin
    status: BusStatus = BusStatus.OPERATIONAL
    group_id: int = Field(validation_alias="groupId", serialization_alias="groupId")

    @field_validator("brand", "model")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El campo es obligatorio.")
        return normalized

    @field_validator("plate")
    @classmethod
    def normalize_plate(cls, value: str) -> str:
        normalized = " ".join(value.split()).upper()
        if not normalized:
            raise ValueError("La placa es obligatoria.")
        return normalized

    @field_validator("number")
    @classmethod
    def normalize_number(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El número de disco es obligatorio.")
        return normalized


class BusUpdate(BusGroupSchema):
    number: BusNumber | None = None
    plate: BusPlate | None = None
    brand: BusText | None = None
    model: BusText | None = None
    year: int | None = Field(default=None, ge=1950, le=date.today().year + 1)
    passenger_capacity: int | None = Field(
        default=None, ge=1, le=200, validation_alias="capacity", serialization_alias="capacity"
    )
    floors: Literal[2] | None = None
    origin: BusOrigin | None = None
    status: BusStatus | None = None
    group_id: int | None = Field(
        default=None, validation_alias="groupId", serialization_alias="groupId"
    )
    template_id: int | None = Field(
    default=None,
    gt=0,
    validation_alias="templateId",
    serialization_alias="templateId"
)

    @field_validator("template_id")
    @classmethod
    def validate_template_id(cls, value: int | None) -> int:
        if value is None:
            raise ValueError("La plantilla del bus no puede ser nula.")
        return value

    @field_validator("brand", "model")
    @classmethod
    def normalize_update_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El campo no puede estar vacío.")
        return normalized

    @field_validator("plate")
    @classmethod
    def normalize_update_plate(cls, value: str | None) -> str | None:
        return " ".join(value.split()).upper() if value is not None else None

    @field_validator("number")
    @classmethod
    def normalize_update_number(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El número de disco no puede estar vacío.")
        return normalized


class BusRead(BusGroupSchema):
    id: int
    number: str
    plate: str
    brand: str
    model: str
    year: int
    passenger_capacity: int = Field(serialization_alias="capacity")
    floors: Literal[2]
    origin: BusOrigin
    status: BusStatus
    group_id: int = Field(serialization_alias="groupId")
    group_name: str = Field(serialization_alias="groupName")
    template_id: int = Field(serialization_alias="templateId")


class BusStatusUpdate(BusGroupSchema):
    status: BusStatus