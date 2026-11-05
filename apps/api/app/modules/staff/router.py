from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_cooperative_admin, require_office_staff
from app.modules.accounts.models import Account
from app.modules.cooperatives.models import Cooperative
from app.modules.staff import service
from app.modules.staff.schemas import (
    OfficeUserCreate,
    OfficeUserRead,
    OfficeUserUpdate,
    StaffSelfRead,
)
from app.modules.staff.models import Staff


router = APIRouter(prefix="/cooperatives", tags=["Cooperative staff"])
staff_self_router = APIRouter(prefix="/staff", tags=["Staff"])


@staff_self_router.get("/me", response_model=StaffSelfRead)
def read_my_staff_profile(
    staff: Annotated[Staff, Depends(require_office_staff)],
    db: Annotated[Session, Depends(get_db)],
) -> StaffSelfRead:
    cooperative = db.get(Cooperative, staff.cooperative_id)
    if cooperative is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El oficinista no tiene una cooperativa asociada.",
        )
    return StaffSelfRead(
        account_id=staff.account_id,
        cooperative_id=staff.cooperative_id,
        first_name=staff.first_name,
        last_name=staff.last_name,
        id_number=staff.id_number,
        email=service.get_staff_account_email(db, staff),
        phone=staff.phone,
        position=staff.position.value,
        cooperative_name=cooperative.name,
        cooperative_ruc=cooperative.ruc,
        cooperative_address=cooperative.address,
        cooperative_phone=cooperative.phone,
        cooperative_email=cooperative.email,
        cooperative_support_phone=cooperative.support_phone,
        cooperative_support_email=cooperative.support_email,
    )


def _to_read(staff, email: str) -> OfficeUserRead:
    return OfficeUserRead(
        id=staff.id,
        account_id=staff.account_id,
        first_name=staff.first_name,
        last_name=staff.last_name,
        id_number=staff.id_number,
        email=email,
        phone=staff.phone,
        position=staff.position.value,
    )


@router.get(
    "/me/office-users",
    response_model=list[OfficeUserRead],
)
def list_office_users(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_cooperative_admin)],
) -> list[OfficeUserRead]:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    return [
        _to_read(staff, email)
        for staff, email in service.list_office_users(
            db,
            cooperative_id=account.cooperative_id,
        )
    ]


@router.get(
    "/me/office-users/{office_user_id}",
    response_model=OfficeUserRead,
)
def read_office_user(
    office_user_id: int,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_cooperative_admin)],
) -> OfficeUserRead:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    try:
        staff, email = service.get_office_user(
            db,
            cooperative_id=account.cooperative_id,
            office_user_id=office_user_id,
        )
    except service.OfficeUserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Oficinista no encontrado.",
        ) from exc
    return _to_read(staff, email)


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
        return _to_read(staff, service.get_staff_account_email(db, staff))
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


@router.patch(
    "/me/office-users/{office_user_id}",
    response_model=OfficeUserRead,
)
def update_office_user(
    office_user_id: int,
    payload: OfficeUserUpdate,
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
        staff, email = service.update_office_user(
            db,
            cooperative_id=account.cooperative_id,
            office_user_id=office_user_id,
            data=payload,
        )
        return _to_read(staff, email)
    except service.OfficeUserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Oficinista no encontrado.",
        ) from exc
    except service.DuplicateOfficeUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.delete(
    "/me/office-users/{office_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_office_user(
    office_user_id: int,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_cooperative_admin)],
    _: Annotated[None, Depends(validate_request_origin)],
) -> Response:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    try:
        service.delete_office_user(
            db,
            cooperative_id=account.cooperative_id,
            office_user_id=office_user_id,
        )
    except service.OfficeUserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Oficinista no encontrado.",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)