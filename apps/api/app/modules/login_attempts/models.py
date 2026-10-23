
from datetime import datetime

from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel


class LoginFailedAttempt(BaseModel):
    """Registra un intento fallido de inicio de sesión."""

    __tablename__ = "login_failed_attempts"

    email_key: Mapped[str] = mapped_column(String(64), nullable=False)
    ip_key: Mapped[str] = mapped_column(String(64), nullable=False)

    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    __table_args__ = (
        Index(
            "ix_login_failed_attempts_identity_time",
            "email_key",
            "ip_key",
            "attempted_at",
        ),
    )
