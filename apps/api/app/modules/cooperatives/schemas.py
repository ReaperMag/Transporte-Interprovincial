import re
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
)


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class CooperativeSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
    )


CooperativeName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)
]
Ruc = Annotated[str, StringConstraints(pattern=r"^\d{13}$", strip_whitespace=True)]
Email = Annotated[
    str,
    StringConstraints(max_length=150, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
Address = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
LogoUrl = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
ProfileUrl = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


def validate_http_url(value: str | None) -> str | None:
    if value is None:
        return value

    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        parsed.port
    except ValueError as exc:
        raise ValueError("Debe ser un enlace HTTP o HTTPS válido.") from exc
    if (
        parsed.scheme not in {"http", "https"}
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("Debe ser un enlace HTTP o HTTPS válido.")
    return value


class CooperativeCreate(CooperativeSchema):
    name: CooperativeName
    ruc: Ruc
    address: Address | None = None
    phone: Phone | None = None
    email: Email | None = None
    logo_url: LogoUrl | None = None
    is_active: bool = True


class CooperativeAccountCreate(CooperativeCreate):
    account_email: EmailStr
    initial_password: str = Field(min_length=12, max_length=128)


class CooperativeUpdate(CooperativeSchema):
    name: CooperativeName | None = None
    ruc: Ruc | None = None
    address: Address | None = None
    phone: Phone | None = None
    email: Email | None = None
    logo_url: LogoUrl | None = None
    is_active: bool | None = None

    @field_validator("name", "ruc")
    @classmethod
    def identity_fields_cannot_be_null(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("This field cannot be null.")
        return value


class CooperativeStatusUpdate(CooperativeSchema):
    is_active: bool


class CooperativeRead(CooperativeSchema):
    id: int
    name: str
    ruc: str
    address: str | None
    phone: str | None
    email: str | None
    logo_url: str | None
    is_active: bool


class CooperativeProfileUpdate(CooperativeSchema):
    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
        extra="forbid",
    )

    address: Address | None = None
    phone: Phone | None = None
    email: Email | None = None
    logo_url: ProfileUrl | None = None
    primary_color: Annotated[str, StringConstraints(pattern=r"^#[0-9A-Fa-f]{6}$")] | None = None
    secondary_color: Annotated[str, StringConstraints(pattern=r"^#[0-9A-Fa-f]{6}$")] | None = None
    facebook_url: ProfileUrl | None = None
    instagram_url: ProfileUrl | None = None
    tiktok_url: ProfileUrl | None = None
    website_url: ProfileUrl | None = None
    description: Description | None = None

    @field_validator(
        "logo_url",
        "facebook_url",
        "instagram_url",
        "tiktok_url",
        "website_url",
    )
    @classmethod
    def links_must_use_http(cls, value: str | None) -> str | None:
        return validate_http_url(value)

    @field_validator("phone")
    @classmethod
    def phone_must_have_a_valid_format(cls, value: str | None) -> str | None:
        if value is None:
            return value
        digits = "".join(character for character in value if character.isdigit())
        if (
            len(digits) < 7
            or len(digits) > 15
            or re.fullmatch(r"\+?[0-9][0-9 ().-]{5,19}", value) is None
        ):
            raise ValueError("Ingresa un número de teléfono válido.")
        return value


class CooperativeProfileRead(CooperativeSchema):
    id: int
    name: str
    ruc: str
    address: str | None
    phone: str | None
    email: str | None
    logo_url: str | None
    primary_color: str | None
    secondary_color: str | None
    facebook_url: str | None
    instagram_url: str | None
    tiktok_url: str | None
    website_url: str | None
    description: str | None


class CooperativeIdentity(CooperativeSchema):
    id: int
    name: str
    ruc: str


class AdminSummary(CooperativeSchema):
    cooperatives: int