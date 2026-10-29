from datetime import timedelta

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.storage import InvalidUploadError, save_upload
from app.modules.cooperatives.models import Cooperative
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.service import notify
from app.modules.passengers.models import PassengerCategory
from app.modules.reservations.models import (
    Reservation,
    ReservationSeat,
    ReservationStatus,
)
from app.modules.reservations.service import (
    ReservationNotFoundError,
    get_reservation,
    now_local,
    release_expired_reservations,
)
from app.modules.sales.models import (
    CategoryDocument,
    Payment,
    PaymentMethod,
    PaymentStatus,
)
from app.modules.sales.schemas import (
    CategoryDocumentRead,
    PaymentInfo,
    PaymentRead,
    RejectionReason,
)
from app.modules.staff.models import Staff
from app.modules.trips.models import Trip


class PaymentError(Exception):
    """Error de negocio al registrar o revisar un pago."""


class PaymentNotFoundError(PaymentError):
    pass


class PaymentNotAllowedError(PaymentError):
    pass


class PaymentConflictError(PaymentError):
    pass


class PaymentValidationError(PaymentError):
    pass


def get_payment_info() -> PaymentInfo:
    """Datos de pago de demostración que se muestran al momento de comprar."""
    return PaymentInfo(
        bankName=settings.payment_bank_name,
        accountType=settings.payment_account_type,
        accountNumber=settings.payment_account_number,
        accountHolder=settings.payment_account_holder,
        deunaQr=settings.payment_deuna_qr,
        isDemo=True,
        maxFileSizeMb=settings.max_upload_size_mb,
        acceptedFileTypes=["application/pdf", "image/jpeg", "image/png"],
        receiptTimeLimitNote=(
            "Sube el comprobante antes de que termine el tiempo de tu reserva."
        ),
    )


def get_trip_cooperative_id(db: Session, reservation: Reservation) -> int:
    return db.get(Trip, reservation.trip_id).cooperative_id


def load_reservation(db: Session, reservation_id: int) -> Reservation:
    """Carga la reserva después de liberar las que vencieron."""
    release_expired_reservations(db)

    try:
        return get_reservation(db, reservation_id)
    except ReservationNotFoundError as exc:
        raise PaymentNotFoundError("Reserva no encontrada.") from exc


def ensure_payable(reservation: Reservation) -> None:
    """
    Verifica que la reserva todavía espere su pago dentro del tiempo límite.
    Se llama después de comprobar el acceso, para no revelar el estado
    de reservas ajenas.
    """
    if reservation.status == ReservationStatus.EXPIRED:
        raise PaymentConflictError(
            "El tiempo de la reserva terminó y los asientos se liberaron."
        )

    if reservation.status != ReservationStatus.PENDING_PAYMENT:
        raise PaymentConflictError("La reserva no está pendiente de pago.")


def pay_in_cash(db: Session, reservation_id: int, staff: Staff) -> Payment:
    """
    El oficinista cobra en efectivo una reserva hecha en la oficina.
    El pago queda aprobado y la reserva confirmada en el mismo momento.
    """
    reservation = load_reservation(db, reservation_id)

    if get_trip_cooperative_id(db, reservation) != staff.cooperative_id:
        raise PaymentNotFoundError("Reserva no encontrada.")

    ensure_payable(reservation)

    if reservation.sold_by_id is None:
        raise PaymentNotAllowedError(
            "El efectivo solo se acepta en reservas hechas en la oficina."
        )

    current_time = now_local()
    payment = Payment(
        reservation_id=reservation.id,
        method=PaymentMethod.CASH,
        amount=reservation.total,
        status=PaymentStatus.APPROVED,
        reviewed_by_id=staff.id,
        reviewed_at=current_time,
    )
    db.add(payment)

    reservation.status = ReservationStatus.CONFIRMED
    reservation.expires_at = None

    db.commit()
    db.refresh(payment)
    return payment


def build_payment_read(db: Session, payment: Payment) -> PaymentRead:
    reservation = db.get(Reservation, payment.reservation_id)
    seat_ids = {seat.id: seat.seat_id for seat in reservation.seats}
    documents = db.scalars(
        select(CategoryDocument)
        .where(CategoryDocument.payment_id == payment.id)
        .order_by(CategoryDocument.id)
    ).all()

    return PaymentRead(
        id=payment.id,
        reservationId=reservation.id,
        tripId=reservation.trip_id,
        method=payment.method,
        amount=payment.amount,
        status=payment.status,
        receiptReference=payment.receipt_reference,
        hasReceipt=payment.receipt_url is not None,
        documents=[
            CategoryDocumentRead(id=document.id, seatId=seat_ids[document.reservation_seat_id])
            for document in documents
        ],
        rejectionReason=payment.rejection_reason,
        reviewedAt=payment.reviewed_at,
        createdAt=payment.created_at,
        reservationStatus=reservation.status,
    )
