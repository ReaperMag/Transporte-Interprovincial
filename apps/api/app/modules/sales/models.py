import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel, str_enum


class PaymentMethod(enum.StrEnum):
    CASH = "cash"  # Solo en oficina, lo registra el oficinista
    DEPOSIT = "deposit"
    TRANSFER = "transfer"


class PaymentStatus(enum.StrEnum):
    PENDING = "pending"  # Comprobante subido, falta la revisión del oficinista
    APPROVED = "approved"
    REJECTED = "rejected"


class Payment(BaseModel):
    """Pago de una reserva. Los depósitos y transferencias llevan comprobante que revisa el oficinista."""

    __tablename__ = "payments"

    reservation_id: Mapped[int] = mapped_column(
        ForeignKey("reservations.id", ondelete="CASCADE"), index=True
    )
    method: Mapped[PaymentMethod] = mapped_column(str_enum(PaymentMethod))
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    status: Mapped[PaymentStatus] = mapped_column(
        str_enum(PaymentStatus), default=PaymentStatus.PENDING
    )
    bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("cooperative_bank_accounts.id", ondelete="SET NULL")
    )
    receipt_url: Mapped[str | None] = mapped_column(String(500))
    receipt_reference: Mapped[str | None] = mapped_column(String(100))  # Número del comprobante
    # Oficinista que cobró en efectivo o que revisó el comprobante
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(String(255))


class CategoryDocument(BaseModel):
    """
    Cédula o carné que sube el pasajero en la compra en línea para respaldar
    la categoría con descuento de un asiento (menor, tercera edad o discapacidad).
    El chofer verifica a la persona al subir al bus.
    """

    __tablename__ = "category_documents"

    reservation_seat_id: Mapped[int] = mapped_column(
        ForeignKey("reservation_seats.id", ondelete="CASCADE"), unique=True
    )
    payment_id: Mapped[int | None] = mapped_column(
        ForeignKey("payments.id", ondelete="SET NULL"), index=True
    )
    file_path: Mapped[str] = mapped_column(String(500))
