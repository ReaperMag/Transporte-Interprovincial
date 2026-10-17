import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel, str_enum


class ReservationStatus(enum.StrEnum):
    PENDING_PAYMENT = "pending_payment"  # Asientos apartados hasta expires_at
    PAYMENT_REVIEW = "payment_review"  # Comprobante subido, esperando al oficinista
    CONFIRMED = "confirmed"  # Pago aprobado y boletos emitidos
    EXPIRED = "expired"  # Venció el tiempo y los asientos se liberaron
    CANCELLED = "cancelled"


class Reservation(BaseModel):
    """Compra de uno o varios asientos de un viaje."""

    __tablename__ = "reservations"

    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id", ondelete="RESTRICT"), index=True)
    # Quien compra: pasajero con cuenta. En la venta en oficina es nulo y se usa sold_by_id
    buyer_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), index=True
    )
    sold_by_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
    status: Mapped[ReservationStatus] = mapped_column(
        str_enum(ReservationStatus), default=ReservationStatus.PENDING_PAYMENT
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
