import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel, str_enum


class NotificationEvent(enum.StrEnum):
    RESERVATION_CREATED = "reservation_created"
    RESERVATION_EXPIRED = "reservation_expired"
    RECEIPT_UPLOADED = "receipt_uploaded"
    PAYMENT_APPROVED = "payment_approved"
    PAYMENT_REJECTED = "payment_rejected"
    TICKET_ISSUED = "ticket_issued"


class Notification(BaseModel):
    """Aviso de un cambio de estado. Se muestra en la aplicación y se envía por correo."""

    __tablename__ = "notifications"

    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    event: Mapped[NotificationEvent] = mapped_column(str_enum(NotificationEvent))
    title: Mapped[str] = mapped_column(String(150))
    message: Mapped[str] = mapped_column(Text)
    reservation_id: Mapped[int | None] = mapped_column(
        ForeignKey("reservations.id", ondelete="SET NULL")
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
