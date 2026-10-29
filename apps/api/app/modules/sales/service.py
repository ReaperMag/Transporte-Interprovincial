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
