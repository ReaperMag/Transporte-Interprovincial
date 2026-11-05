from datetime import datetime
import re
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

from app.core.validators import EmailWithDomain, validate_phone, validate_ruc


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
# RUC ecuatoriano de 13 números con provincia y establecimiento válidos.
Ruc = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=13),
    AfterValidator(validate_ruc),
]
Email = Annotated[EmailWithDomain, StringConstraints(max_length=150)]
Phone = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=20),
    AfterValidator(validate_phone),
]
Address = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
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


class CooperativeAdminWrite(CooperativeSchema):
    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
        extra="forbid",
    )

    name: CooperativeName
    ruc: Ruc
    address: Address | None = None
    phone: Phone | None = None


class CooperativeCreate(CooperativeAdminWrite):
    name: CooperativeName
    ruc: Ruc


class CooperativeAccountCreate(CooperativeCreate):
    account_email: EmailWithDomain
    initial_password: str = Field(min_length=12, max_length=128)


class CooperativeUpdate(CooperativeAdminWrite):
    name: CooperativeName | None = None
    ruc: Ruc | None = None
    address: Address | None = None
    phone: Phone | None = None
    email: Email | None = None

    @field_validator("name", "ruc")
    @classmethod
    def identity_fields_cannot_be_null(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("This field cannot be null.")
        return value


class CooperativeRead(CooperativeSchema):
    id: int
    name: str
    ruc: str
    address: str | None
    phone: str | None
    email: str | None
    logo_url: str | None


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


class BusRouteFrequency(CooperativeSchema):
    bus_id: int
    bus_number: str
    plate: str
    route_id: int
    origin_city: str
    destination_city: str
    departure_time: str
    resolution_number: str
    trip_count: int
    last_departure_at: datetime | None


class CooperativeRouteFrequencySummary(CooperativeSchema):
    active_routes: int
    active_frequencies: int
    bus_assignments: list[BusRouteFrequency]
