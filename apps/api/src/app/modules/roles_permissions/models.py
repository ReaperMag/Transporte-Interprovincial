from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel


class Role(BaseModel):
    """Rol del sistema: administrador, cooperativa, oficinista, personal del bus o pasajero."""

    __tablename__ = "roles"

    code: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(255))
