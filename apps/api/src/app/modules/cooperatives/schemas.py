from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


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


class CooperativeCreate(CooperativeSchema):
    name: CooperativeName
    ruc: Ruc
    address: Address | None = None
    phone: Phone | None = None
    email: Email | None = None
    logo_url: LogoUrl | None = None
    is_active: bool = True


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


class AdminSummary(CooperativeSchema):
    cooperatives: int