
from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.modules.passengers.models import PassengerCategory


class PassengerProfileResponse(BaseModel):
    accountId: int
    email: str
    hasPassengerProfile: bool

    idNumber: str | None = None
    firstName: str | None = None
    lastName: str | None = None
    birthDate: date | None = None
    phone: str | None = None
    category: str | None = None
    categoryVerified: bool | None = None


class PassengerProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    firstName: str | None = Field(default=None, max_length=100)
    lastName: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    birthDate: date | None = None
    phone: str | None = Field(default=None, max_length=20)
    category: PassengerCategory | None = None

    @field_validator("firstName", "lastName")
    @classmethod
    def validate_name(cls, value: str | None) -> str:
        if value is None or not value.strip():
            raise ValueError("El nombre o apellido no puede estar vacío.")
        return value.strip()

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: EmailStr | None) -> EmailStr:
        if value is None:
            raise ValueError("El correo electrónico no puede ser nulo.")
        return value

    @field_validator("category")
    @classmethod
    def validate_category(
        cls, value: PassengerCategory | None
    ) -> PassengerCategory:
        if value is None:
            raise ValueError("La categoría no puede ser nula.")
        return value

    @field_validator("birthDate")
    @classmethod
    def validate_birth_date(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("La fecha de nacimiento no puede ser futura.")
        return value

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None
