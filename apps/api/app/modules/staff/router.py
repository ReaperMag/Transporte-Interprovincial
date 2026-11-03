from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_cooperative_admin
from app.modules.accounts.models import Account
from app.modules.staff import service
from app.modules.staff.schemas import OfficeUserCreate, OfficeUserRead


router = APIRouter(prefix="/cooperatives", tags=["Cooperative staff"])


@router.post(
    "/me/office-users",
    response_model=OfficeUserRead,
    status_code=status.HTTP_201_CREATED,
)
def create_office_user(
    payload: OfficeUserCreate,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_cooperative_admin)],
    _: Annotated[None, Depends(validate_request_origin)],
) -> OfficeUserRead:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )

    try:
        staff = service.create_office_user(
            db,
            cooperative_id=account.cooperative_id,
            data=payload,
        )
        return OfficeUserRead(
            id=staff.id,
            account_id=staff.account_id,
            first_name=staff.first_name,
            last_name=staff.last_name,
            id_number=staff.id_number,
            email=service.get_staff_account_email(db, staff),
            phone=staff.phone,
            position=staff.position.value,
        )
    except service.DuplicateOfficeUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except service.ClerkRoleNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc