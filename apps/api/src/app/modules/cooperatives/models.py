from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel


class Cooperative(BaseModel):
    """Cooperativa de transporte. El administrador la crea; la cooperativa edita todo menos el nombre."""

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

    # Minutos que un asiento queda reservado antes de liberarse si no se sube el comprobante
    reservation_timeout_minutes: Mapped[int] = mapped_column(default=15)
    is_active: Mapped[bool] = mapped_column(default=True)
