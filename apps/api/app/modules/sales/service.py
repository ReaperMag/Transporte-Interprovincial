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
from app.modules.tickets.service import issue_tickets
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
    El pago queda aprobado, la reserva confirmada y los boletos emitidos
    en el mismo momento.
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
    issue_tickets(db, reservation)

    db.commit()
    db.refresh(payment)
    return payment


def submit_receipt(
    db: Session,
    reservation_id: int,
    account_id: int,
    *,
    method: PaymentMethod,
    receipt: UploadFile,
    receipt_reference: str | None,
    documents: list[UploadFile],
    document_seat_ids: list[int],
) -> Payment:
    """
    El pasajero sube el comprobante de su depósito o transferencia.

    Si algún asiento tiene una categoría con descuento, también sube la cédula
    o el carné de esa persona, salvo que ya lo haya subido antes. La reserva
    pasa a revisión y deja de vencer mientras el oficinista la revisa.
    """
    if method == PaymentMethod.CASH:
        raise PaymentValidationError(
            "El efectivo solo se registra en la oficina."
        )

    reservation = load_reservation(db, reservation_id)

    if reservation.buyer_account_id != account_id:
        raise PaymentNotFoundError("Reserva no encontrada.")

    ensure_payable(reservation)

    if len(documents) != len(document_seat_ids):
        raise PaymentValidationError(
            "Cada documento debe indicar a qué asiento pertenece."
        )

    seats_by_id = {seat.seat_id: seat for seat in reservation.seats}
    already_uploaded = {
        document.reservation_seat_id
        for document in db.scalars(
            select(CategoryDocument).where(
                CategoryDocument.reservation_seat_id.in_(
                    [seat.id for seat in reservation.seats]
                )
            )
        ).all()
    }

    documents_by_seat: dict[int, UploadFile] = {}
    for seat_id, document in zip(document_seat_ids, documents):
        seat = seats_by_id.get(seat_id)
        if seat is None:
            raise PaymentValidationError("El documento es de un asiento que no está en la reserva.")
        if seat.passenger_category == PassengerCategory.REGULAR:
            raise PaymentValidationError(
                "Solo se suben documentos para asientos con categoría de descuento."
            )
        documents_by_seat[seat.id] = document

    missing = [
        seat
        for seat in reservation.seats
        if seat.passenger_category != PassengerCategory.REGULAR
        and seat.id not in already_uploaded
        and seat.id not in documents_by_seat
    ]
    if missing:
        raise PaymentValidationError(
            "Falta la cédula o el carné de los pasajeros con descuento."
        )

    try:
        receipt_path = save_upload(receipt, "receipts")
        document_paths = {
            reservation_seat_id: save_upload(document, "documents")
            for reservation_seat_id, document in documents_by_seat.items()
        }
    except InvalidUploadError as exc:
        raise PaymentValidationError(str(exc)) from exc

    payment = Payment(
        reservation_id=reservation.id,
        method=method,
        amount=reservation.total,
        status=PaymentStatus.PENDING,
        receipt_url=receipt_path,
        receipt_reference=receipt_reference.strip() if receipt_reference else None,
    )
    db.add(payment)
    db.flush()

    for reservation_seat_id, path in document_paths.items():
        db.add(
            CategoryDocument(
                reservation_seat_id=reservation_seat_id,
                payment_id=payment.id,
                file_path=path,
            )
        )

    reservation.status = ReservationStatus.PAYMENT_REVIEW

    notify(
        db,
        account_id=reservation.buyer_account_id,
        event=NotificationEvent.RECEIPT_UPLOADED,
        title="Comprobante recibido",
        message="Tu comprobante está en revisión. Te avisaremos cuando el oficinista lo revise.",
        reservation_id=reservation.id,
    )

    db.commit()
    db.refresh(payment)
    return payment


def list_pending_payments(db: Session, staff: Staff) -> list[Payment]:
    """Comprobantes por revisar de los viajes de la cooperativa del oficinista."""
    return list(
        db.scalars(
            select(Payment)
            .join(Reservation, Payment.reservation_id == Reservation.id)
            .join(Trip, Reservation.trip_id == Trip.id)
            .where(
                Payment.status == PaymentStatus.PENDING,
                Trip.cooperative_id == staff.cooperative_id,
            )
            .order_by(Payment.created_at, Payment.id)
        ).all()
    )


def list_reservation_payments(db: Session, reservation: Reservation) -> list[Payment]:
    return list(
        db.scalars(
            select(Payment)
            .where(Payment.reservation_id == reservation.id)
            .order_by(Payment.created_at, Payment.id)
        ).all()
    )


def get_payment_for_staff(db: Session, payment_id: int, staff: Staff) -> Payment:
    """Pago de un viaje de la cooperativa del oficinista."""
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise PaymentNotFoundError("Pago no encontrado.")

    reservation = db.get(Reservation, payment.reservation_id)
    if get_trip_cooperative_id(db, reservation) != staff.cooperative_id:
        raise PaymentNotFoundError("Pago no encontrado.")

    return payment


def get_pending_payment_for_staff(db: Session, payment_id: int, staff: Staff) -> Payment:
    payment = get_payment_for_staff(db, payment_id, staff)
    if payment.status != PaymentStatus.PENDING:
        raise PaymentConflictError("El pago ya fue revisado.")
    return payment


def approve_payment(db: Session, payment_id: int, staff: Staff) -> Payment:
    """
    El oficinista aprueba el comprobante, la reserva queda confirmada
    y se emiten los boletos.
    """
    payment = get_pending_payment_for_staff(db, payment_id, staff)
    reservation = db.get(Reservation, payment.reservation_id)

    payment.status = PaymentStatus.APPROVED
    payment.reviewed_by_id = staff.id
    payment.reviewed_at = now_local()

    reservation.status = ReservationStatus.CONFIRMED
    reservation.expires_at = None

    notify(
        db,
        account_id=reservation.buyer_account_id,
        event=NotificationEvent.PAYMENT_APPROVED,
        title="Pago aprobado",
        message="Tu pago fue aprobado y tu compra está confirmada.",
        reservation_id=reservation.id,
    )
    issue_tickets(db, reservation)

    db.commit()
    db.refresh(payment)
    return payment


REJECTION_MESSAGES = {
    RejectionReason.PAYMENT_NOT_RECEIVED: (
        "No se recibió el pago. Los asientos se liberaron; vuelve a hacer la reserva."
    ),
    RejectionReason.RECEIPT_UNVERIFIABLE: (
        "No se pudo verificar la transferencia. Vuelve a subir el comprobante."
    ),
}

SECOND_REJECTION_MESSAGE = (
    "No se pudo verificar el comprobante por segunda vez. "
    "Los asientos se liberaron; vuelve a hacer la reserva."
)


def count_previous_rejections(db: Session, reservation_id: int, payment_id: int) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Payment)
        .where(
            Payment.reservation_id == reservation_id,
            Payment.status == PaymentStatus.REJECTED,
            Payment.id != payment_id,
        )
    ) or 0


def reject_payment(
    db: Session,
    payment_id: int,
    staff: Staff,
    reason: RejectionReason,
    comment: str | None,
) -> Payment:
    """
    El oficinista rechaza el comprobante.

    - Pago no recibido: la reserva se cancela y los asientos se liberan.
    - Comprobante no verificable: la reserva vuelve a esperar el pago con
      un nuevo tiempo límite. Solo hay una segunda oportunidad; si vuelve
      a pasar, la reserva se cancela.
    """
    payment = get_pending_payment_for_staff(db, payment_id, staff)
    reservation = db.get(Reservation, payment.reservation_id)

    gives_new_chance = (
        reason == RejectionReason.RECEIPT_UNVERIFIABLE
        and count_previous_rejections(db, reservation.id, payment.id) == 0
    )

    if gives_new_chance:
        message = REJECTION_MESSAGES[reason]
        cooperative = db.get(Cooperative, get_trip_cooperative_id(db, reservation))
        reservation.status = ReservationStatus.PENDING_PAYMENT
        reservation.expires_at = now_local() + timedelta(
            minutes=cooperative.reservation_timeout_minutes
        )
    else:
        message = (
            REJECTION_MESSAGES[reason]
            if reason == RejectionReason.PAYMENT_NOT_RECEIVED
            else SECOND_REJECTION_MESSAGE
        )
        reservation.status = ReservationStatus.CANCELLED
        reservation.expires_at = None

    if comment and comment.strip():
        message = f"{message} Comentario del oficinista: {comment.strip()}"

    payment.status = PaymentStatus.REJECTED
    payment.reviewed_by_id = staff.id
    payment.reviewed_at = now_local()
    payment.rejection_reason = message[:255]

    notify(
        db,
        account_id=reservation.buyer_account_id,
        event=NotificationEvent.PAYMENT_REJECTED,
        title="Pago rechazado",
        message=message,
        reservation_id=reservation.id,
    )

    db.commit()
    db.refresh(payment)
    return payment


def get_category_document(db: Session, document_id: int) -> CategoryDocument:
    document = db.get(CategoryDocument, document_id)
    if document is None:
        raise PaymentNotFoundError("Documento no encontrado.")
    return document


def get_document_reservation(db: Session, document: CategoryDocument) -> Reservation:
    seat = db.get(ReservationSeat, document.reservation_seat_id)
    return db.get(Reservation, seat.reservation_id)


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
