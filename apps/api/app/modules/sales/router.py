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


@router.get(
    "/methods",
    response_model=PaymentInfo,
)
def get_payment_methods(
    _: Annotated[Account, Depends(get_current_account)],
):
    """Datos de demostración para pagar por depósito, transferencia o DeUna."""
    return service.get_payment_info()
