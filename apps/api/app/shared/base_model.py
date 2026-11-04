import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Clase base de la que heredan todas las entidades."""


class BaseModel(Base):
    """Entidad con id y fechas de creación y actualización."""

    __abstract__ = True

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


def str_enum(enum_class: type[enum.Enum]) -> Enum:
    """Guarda un Enum como texto con su valor (por ejemplo 'vip'), compatible con SQLite."""
    return Enum(
        enum_class,
        native_enum=False,
        length=30,
        values_callable=lambda members: [member.value for member in members],
    )
