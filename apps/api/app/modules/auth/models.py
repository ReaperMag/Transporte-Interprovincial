import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel, str_enum


class VerificationPurpose(enum.StrEnum):
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"


class VerificationCode(BaseModel):
    """
    Código de 6 dígitos enviado por correo.

    Solo se guarda su hash. Deja de servir cuando se usa (used_at), cuando
    se reemplaza por uno nuevo o se agotan los intentos (revoked_at) o
    cuando vence (expires_at).
    """

    __tablename__ = "verification_codes"

    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    purpose: Mapped[VerificationPurpose] = mapped_column(str_enum(VerificationPurpose))
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(default=0)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
