import enum

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import str_enum
from app.shared.tenant_model import TenantModel


class StaffPosition(enum.StrEnum):
    ADMIN = "admin"  # Administra la cooperativa
    CLERK = "clerk"  # Oficinista
    DRIVER = "driver"  # Chofer
    CONTROLLER = "controller"  # Controlador o ayudante


class Staff(TenantModel):
    """Persona que trabaja en una cooperativa."""

    __tablename__ = "staff"

    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), unique=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    id_number: Mapped[str] = mapped_column(String(13), unique=True)  # Cédula
    phone: Mapped[str | None] = mapped_column(String(20))
    position: Mapped[StaffPosition] = mapped_column(str_enum(StaffPosition))
    # El personal del bus tiene asignado un bus y ve los viajes de ese bus
    assigned_bus_id: Mapped[int | None] = mapped_column(ForeignKey("buses.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(default=True)
