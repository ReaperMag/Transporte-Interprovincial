import re
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

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
    digits = "".join(character for character in value if character.isdigit())
    if (
        len(digits) < 7
        or len(digits) > 15
        or re.fullmatch(r"\+?[0-9][0-9 ().-]{5,19}", value) is None
    ):
        raise ValueError("Ingresa un número de teléfono válido.")
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

    _validate_id_number = field_validator("id_number")(validate_ecuadorian_id)
    _validate_phone = field_validator("phone")(validate_phone)


class OfficeUserRead(StaffSchema):
    id: int
    account_id: int
    first_name: str
    last_name: str
    id_number: str
    email: EmailStr
    phone: str
    position: str