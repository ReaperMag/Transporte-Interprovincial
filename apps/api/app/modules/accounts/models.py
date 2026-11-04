import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.modules.roles_permissions.models import Role
from app.shared.base_model import BaseModel, str_enum


class AccountType(enum.StrEnum):
    SUPER_ADMIN = "super_admin"
    COOPERATIVE = "cooperative"  # Personal de una cooperativa: administrador, oficinista o personal del bus
    PASSENGER = "passenger"


class Account(BaseModel):
    """Usuario que inicia sesión en la aplicación."""

    __tablename__ = "accounts"

    email: Mapped[str] = mapped_column(String(150), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    account_type: Mapped[AccountType] = mapped_column(str_enum(AccountType))
    role_id: Mapped[int | None] = mapped_column(ForeignKey("roles.id", ondelete="SET NULL"))
    # Solo para cuentas del personal de una cooperativa
    cooperative_id: Mapped[int | None] = mapped_column(
        ForeignKey("cooperatives.id", ondelete="CASCADE"), index=True
    )
    is_active: Mapped[bool] = mapped_column(default=True)
    # Solo el registro público de pasajeros crea cuentas sin verificar. Las
    # cuentas existentes, el administrador y las cooperativas quedan verificadas.
    is_email_verified: Mapped[bool] = mapped_column(default=True, server_default=true())
    # Pasajero registrado en una venta de oficina que esta cuenta reclamó al
    # registrarse. La vinculación se concreta solo cuando verifica su correo.
    pending_passenger_id: Mapped[int | None] = mapped_column(
        ForeignKey("passengers.id", ondelete="SET NULL", use_alter=True)
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    role: Mapped[Role | None] = relationship()
