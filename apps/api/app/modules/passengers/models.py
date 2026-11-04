import enum
from datetime import date

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel, str_enum


class PassengerCategory(enum.StrEnum):
    REGULAR = "regular"
    MINOR = "minor"  # Menor de edad
    SENIOR = "senior"  # Tercera edad
    DISABILITY = "disability"  # Persona con discapacidad


class Passenger(BaseModel):
    """
    Persona que viaja, identificada por su cédula.

    Se registra al comprar (también los acompañantes) o en una venta extra del chofer. Si luego
    crea una cuenta, se vincula con account_id y conserva el historial de viajes anteriores.
    """

    __tablename__ = "passengers"

    id_number: Mapped[str] = mapped_column(String(13), unique=True)  # Cédula o pasaporte
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    birth_date: Mapped[date | None] = mapped_column(Date)
    email: Mapped[str | None] = mapped_column(String(150))
    phone: Mapped[str | None] = mapped_column(String(20))
    category: Mapped[PassengerCategory] = mapped_column(
        str_enum(PassengerCategory), default=PassengerCategory.REGULAR
    )
    # La categoría con descuento debe validarse con la cédula antes de aplicarse
    category_verified: Mapped[bool] = mapped_column(default=False)
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), unique=True
    )
