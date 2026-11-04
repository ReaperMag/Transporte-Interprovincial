from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core.validators import (
    EmailWithDomain,
    PersonName,
    validate_cedula,
    validate_phone,
)
from app.modules.auth.schemas import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class StaffSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
    )


NonEmptyName = Annotated[PersonName, StringConstraints(max_length=100)]
Phone = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)
]


class OfficeUserCreate(StaffSchema):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )

    first_name: NonEmptyName
    last_name: NonEmptyName
    id_number: Annotated[str, StringConstraints(strip_whitespace=True)]
    email: EmailWithDomain
    phone: Phone
    password: str = Field(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
    )

    _validate_id_number = field_validator("id_number")(validate_cedula)
    _validate_phone = field_validator("phone")(validate_phone)


class OfficeUserUpdate(StaffSchema):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )

    first_name: NonEmptyName | None = None
    last_name: NonEmptyName | None = None
    id_number: Annotated[str, StringConstraints(strip_whitespace=True)] | None = None
    email: EmailWithDomain | None = None
    phone: Phone | None = None

    _validate_id_number = field_validator("id_number")(validate_cedula)
    _validate_phone = field_validator("phone")(validate_phone)

    @model_validator(mode="after")
    def require_a_change(self) -> "OfficeUserUpdate":
        if not self.model_fields_set:
            raise ValueError("Envía al menos un campo para actualizar.")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Los campos enviados no pueden ser nulos.")
        return self


class OfficeUserRead(StaffSchema):
    id: int
    account_id: int
    first_name: str
    last_name: str
    id_number: str
    email: EmailStr
    phone: str | None
    position: str