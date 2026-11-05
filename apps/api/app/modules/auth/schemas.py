
from typing import Literal, Self

from pydantic import (
    BaseModel,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


# Política de contraseñas compartida por el registro y la recuperación.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


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
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
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

class LoginRequest(BaseModel):
    """Credenciales recibidas para iniciar sesión."""

    email: EmailStr
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    """Información pública de la cuenta autenticada."""

    accountId: int
    email: EmailStr
    accountType: Literal["passenger", "cooperative", "oficinista", "super_admin"]


class EmailRequest(BaseModel):
    """Correo para reenviar el código de verificación o recuperar la contraseña."""

    email: EmailStr


class VerifyEmailRequest(BaseModel):
    """Código recibido por correo para verificar la cuenta."""

    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")

    @field_validator("code", mode="before")
    @classmethod
    def remove_spaces(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class MessageResponse(BaseModel):
    """Respuesta con un mensaje para mostrar al usuario."""

    message: str


class ResetPasswordRequest(BaseModel):
    """Código de recuperación y nueva contraseña."""

    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
    confirmPassword: str

    @field_validator("code", mode="before")
    @classmethod
    def remove_spaces(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="after")
    def validate_passwords(self) -> Self:
        if self.password != self.confirmPassword:
            raise ValueError("Las contraseñas no coinciden")
        return self
