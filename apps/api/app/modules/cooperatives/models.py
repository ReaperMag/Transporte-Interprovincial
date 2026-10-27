import enum

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base_model import BaseModel, str_enum
from app.shared.tenant_model import TenantModel


class BankAccountType(enum.StrEnum):
    SAVINGS = "savings"
    CHECKING = "checking"


class Cooperative(BaseModel):
    """Cooperativa de transporte. El nombre y el RUC solo los modifica el administrador."""

    __tablename__ = "cooperatives"

    name: Mapped[str] = mapped_column(String(150), unique=True)
    ruc: Mapped[str] = mapped_column(String(13), unique=True)
    address: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(150))

    # Configuración visual y de contacto
    logo_url: Mapped[str | None] = mapped_column(String(500))
    primary_color: Mapped[str | None] = mapped_column(String(7))
    secondary_color: Mapped[str | None] = mapped_column(String(7))
    support_phone: Mapped[str | None] = mapped_column(String(20))
    support_email: Mapped[str | None] = mapped_column(String(150))
    facebook_url: Mapped[str | None] = mapped_column(String(500))
    instagram_url: Mapped[str | None] = mapped_column(String(500))
    tiktok_url: Mapped[str | None] = mapped_column(String(500))
    website_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(String(1000))

    # Minutos que un asiento queda reservado antes de liberarse si no se sube el comprobante
    reservation_timeout_minutes: Mapped[int] = mapped_column(default=15)
    is_active: Mapped[bool] = mapped_column(default=True)

    bank_accounts: Mapped[list["CooperativeBankAccount"]] = relationship(
        back_populates="cooperative", cascade="all, delete-orphan"
    )


class CooperativeBankAccount(TenantModel):
    """Cuenta donde los pasajeros hacen depósitos o transferencias."""

    __tablename__ = "cooperative_bank_accounts"

    bank_name: Mapped[str] = mapped_column(String(100))
    account_number: Mapped[str] = mapped_column(String(30))
    account_type: Mapped[BankAccountType] = mapped_column(str_enum(BankAccountType))
    holder_name: Mapped[str] = mapped_column(String(150))
    holder_id_number: Mapped[str | None] = mapped_column(String(13))
    is_active: Mapped[bool] = mapped_column(default=True)

    cooperative: Mapped[Cooperative] = relationship(back_populates="bank_accounts")
