from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.core.storage import resolve_upload
from app.modules.accounts.models import Account, AccountType
from app.modules.reservations.models import Reservation
from app.modules.reservations.router import (
    get_office_staff,
    require_office_staff,
    require_passenger,
)
from app.modules.sales import service
from app.modules.sales.models import Payment, PaymentMethod
from app.modules.sales.schemas import PaymentInfo, PaymentRead, PaymentRejection
from app.modules.staff.models import Staff


router = APIRouter(
    prefix="/payments",
    tags=["Pagos"],
)


def raise_payment_error(exc: service.PaymentError) -> None:
    """Traduce los errores de negocio a respuestas HTTP."""
    status_by_error = {
        service.PaymentNotFoundError: status.HTTP_404_NOT_FOUND,
        service.PaymentNotAllowedError: status.HTTP_403_FORBIDDEN,
        service.PaymentConflictError: status.HTTP_409_CONFLICT,
        service.PaymentValidationError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    }
    raise HTTPException(
        status_code=status_by_error.get(type(exc), status.HTTP_400_BAD_REQUEST),
        detail=str(exc),
    ) from exc


@router.get(
    "/methods",
    response_model=PaymentInfo,
)
def get_payment_methods(
    _: Annotated[Account, Depends(get_current_account)],
):
    """Datos de demostración para pagar por depósito, transferencia o DeUna."""
    return service.get_payment_info()


@router.post(
    "/reservations/{reservation_id}/cash",
    response_model=PaymentRead,
    status_code=status.HTTP_201_CREATED,
)
def pay_reservation_in_cash(
    reservation_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_office_staff)],
    _: None = Depends(validate_request_origin),
):
    """El oficinista cobra en efectivo una reserva hecha en la oficina."""
    try:
        payment = service.pay_in_cash(db, reservation_id, staff)
    except service.PaymentError as exc:
        raise_payment_error(exc)
    return service.build_payment_read(db, payment)
