
from typing import Literal, Self

from pydantic import (
    BaseModel,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


class SignupRequest(BaseModel):
    """Datos recibidos para registrar un pasajero."""

    firstName: str = Field(min_length=1, max_length=100)
    lastName: str = Field(min_length=1, max_length=100)
    idNumber: str = Field(
        min_length=1,
        max_length=13,
        pattern=r"^[A-Za-z0-9]+$",
    )
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirmPassword: str

    @field_validator(
        "firstName",
        "lastName",
        "idNumber",
        mode="before",
    )
    @classmethod
    def remove_extra_spaces(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="after")
    def validate_passwords(self) -> Self:
        if self.password != self.confirmPassword:
            raise ValueError("Las contraseñas no coinciden")
        return self


class SignupResponse(BaseModel):
    """Información pública devuelta después del registro."""

    accountId: int
    email: EmailStr
    accountType: Literal["passenger"]
