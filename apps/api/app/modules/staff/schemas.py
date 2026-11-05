import re
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

from app.modules.auth.schemas import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


def validate_ecuadorian_id(value: str) -> str:
    """Validate a natural-person Ecuadorian identity number."""
    if not re.fullmatch(r"\d{10}", value):
        raise ValueError("La cédula debe contener exactamente diez dígitos.")

    province = int(value[:2])
    third_digit = int(value[2])
    if not 1 <= province <= 24 or third_digit > 5:
        raise ValueError("La cédula ecuatoriana no es válida.")

    digits = [int(digit) for digit in value]
    total = 0
    for index, digit in enumerate(digits[:9]):
        if index % 2 == 0:
            product = digit * 2
            total += product - 9 if product >= 10 else product
        else:
            total += digit

    verifier = (10 - total % 10) % 10
    if verifier != digits[9]:
        raise ValueError("La cédula ecuatoriana no es válida.")
    return value


def validate_phone(value: str) -> str:
    if re.fullmatch(r"\d{7,10}", value) is None:
        raise ValueError("El teléfono debe contener entre siete y diez dígitos.")
    return value


class StaffSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
    )


NonEmptyName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
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
    email: EmailStr
    phone: Phone
    password: str = Field(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
    )
    confirm_password: str = Field(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
    )

    _validate_id_number = field_validator("id_number")(validate_ecuadorian_id)
    _validate_phone = field_validator("phone")(validate_phone)

    @model_validator(mode="after")
    def passwords_must_match(self) -> "OfficeUserCreate":
        if self.password != self.confirm_password:
            raise ValueError("Las contraseñas no coinciden.")
        return self


class OfficeUserUpdate(StaffSchema):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )

    first_name: NonEmptyName | None = None
    last_name: NonEmptyName | None = None
    id_number: Annotated[str, StringConstraints(strip_whitespace=True)] | None = None
    email: EmailStr | None = None
    phone: Phone | None = None

    _validate_id_number = field_validator("id_number")(validate_ecuadorian_id)
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


class StaffSelfRead(StaffSchema):
    account_id: int
    cooperative_id: int
    first_name: str
    last_name: str
    id_number: str
    email: EmailStr
    phone: str | None
    position: str
    cooperative_name: str
    cooperative_ruc: str
    cooperative_address: str | None
    cooperative_phone: str | None
    cooperative_email: EmailStr | None
    cooperative_support_phone: str | None
    cooperative_support_email: EmailStr | None