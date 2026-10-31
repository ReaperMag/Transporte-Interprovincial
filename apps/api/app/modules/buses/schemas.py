from datetime import date
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.modules.buses.models import BusOrigin, BusStatus, SeatType

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


class BusTemplateSeatCreate(BusGroupSchema):
    number: int = Field(ge=1, le=200)
    floor: int = Field(ge=1, le=2)
    row: int = Field(ge=1, le=50)
    column: int = Field(ge=1, le=10)
    seat_type: SeatType = SeatType.NORMAL


class BusTemplateCreate(BusGroupSchema):
    name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    floors: Literal[1, 2]
    has_bathroom: bool
    rows: int = Field(ge=1, le=50)
    columns: int = Field(ge=1, le=10)
    seats: list[BusTemplateSeatCreate] = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El nombre de la plantilla es obligatorio.")
        return normalized

    @model_validator(mode="after")
    def validate_seat_layout(self) -> "BusTemplateCreate":
        numbers: set[int] = set()
        positions: set[tuple[int, int, int]] = set()
        for seat in self.seats:
            if seat.floor > self.floors:
                raise ValueError("El piso de un asiento no existe en la plantilla.")
            if seat.row > self.rows or seat.column > self.columns:
                raise ValueError("La posición de un asiento excede la cuadrícula.")
            if seat.number in numbers:
                raise ValueError("Los números de asiento no pueden repetirse.")
            position = (seat.floor, seat.row, seat.column)
            if position in positions:
                raise ValueError("La posición de un asiento no puede repetirse.")
            numbers.add(seat.number)
            positions.add(position)
        return self


class BusCreate(BusGroupSchema):
    number: BusNumber
    plate: BusPlate
    template_id: int | None = Field(
        default=None,
        gt=0,
        validation_alias="templateId",
        serialization_alias="templateId",
    )
    template: BusTemplateCreate | None = None
    brand: BusText
    model: BusText
    year: int = Field(ge=1950, le=date.today().year + 1)
    passenger_capacity: int = Field(
        ge=1, le=200, validation_alias="capacity", serialization_alias="capacity"
    )
    floors: Literal[1, 2] | None = None
    origin: BusOrigin
    status: BusStatus = BusStatus.OPERATIONAL
    group_id: int = Field(validation_alias="groupId", serialization_alias="groupId")

    @model_validator(mode="after")
    def validate_template_choice(self) -> "BusCreate":
        if (self.template_id is None) == (self.template is None):
            raise ValueError("Envía exactamente una plantilla: templateId o template.")
        if self.template is not None:
            if self.floors is not None and self.floors != self.template.floors:
                raise ValueError("Los pisos del bus deben coincidir con los de la plantilla.")
            self.floors = self.template.floors
        elif self.floors is None:
            self.floors = 2
        return self

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
    floors: Literal[1, 2] | None = None
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


class BusPhotoRead(BusGroupSchema):
    id: int
    url: str


class BusRead(BusGroupSchema):
    id: int
    number: str
    plate: str
    brand: str
    model: str
    year: int
    passenger_capacity: int = Field(serialization_alias="capacity")
    floors: Literal[1, 2]
    origin: BusOrigin
    status: BusStatus
    group_id: int = Field(serialization_alias="groupId")
    group_name: str = Field(serialization_alias="groupName")
    template_id: int = Field(serialization_alias="templateId")
    photos: list[BusPhotoRead] = Field(default_factory=list)


class BusStatusUpdate(BusGroupSchema):
    status: BusStatus