import enum
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.modules.reservations.models import ReservationStatus
from app.modules.sales.models import PaymentMethod, PaymentStatus


class PaymentInfo(BaseModel):
    """Datos que ve el pasajero para pagar por depósito, transferencia o DeUna."""

    bankName: str
    accountType: str
    accountNumber: str
    accountHolder: str
    deunaQr: str
    isDemo: bool
    maxFileSizeMb: int
    acceptedFileTypes: list[str]
    receiptTimeLimitNote: str


class RejectionReason(enum.StrEnum):
    # No llegó el dinero: se cancela la reserva y se liberan los asientos.
    PAYMENT_NOT_RECEIVED = "payment_not_received"
    # No se pudo verificar el comprobante: se da una nueva oportunidad.
    RECEIPT_UNVERIFIABLE = "receipt_unverifiable"


class PaymentRejection(BaseModel):
    reason: RejectionReason
    comment: str | None = Field(default=None, max_length=150)


class CategoryDocumentRead(BaseModel):
    id: int
    seatId: int


class PaymentRead(BaseModel):
    id: int
    reservationId: int
    tripId: int
    method: PaymentMethod
    amount: Decimal
    status: PaymentStatus
    receiptReference: str | None
    hasReceipt: bool
    documents: list[CategoryDocumentRead]
    rejectionReason: str | None
    reviewedAt: datetime | None
    createdAt: datetime
    reservationStatus: ReservationStatus
