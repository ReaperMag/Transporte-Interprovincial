from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_bus_staff, require_cooperative_admin
from app.modules.accounts.models import Account
from app.modules.staff import bus_staff_service as service
from app.modules.staff.models import Staff
from app.modules.staff.schemas import (
    BusStaffCreate,
    BusStaffRead,
    BusStaffSelfRead,
    BusStaffUpdate,
)


router = APIRouter(prefix="/cooperatives/me/bus-staff", tags=["Personal del bus"])
bus_staff_self_router = APIRouter(prefix="/bus-staff", tags=["Personal del bus"])


def cooperative_id_of(account: Account) -> int:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    return account.cooperative_id


def raise_bus_staff_error(exc: service.BusStaffError) -> NoReturn:
    status_codes = {
        service.BusStaffNotFoundError: status.HTTP_404_NOT_FOUND,
        service.DuplicateBusStaffError: status.HTTP_409_CONFLICT,
        service.InvalidAssignedBusError: 422,
        service.BusStaffRoleNotConfiguredError: status.HTTP_500_INTERNAL_SERVER_ERROR,
    }
    raise HTTPException(
        status_code=status_codes.get(type(exc), status.HTTP_400_BAD_REQUEST),
        detail=str(exc),
    ) from exc


@router.get("", response_model=list[BusStaffRead])
def list_bus_staff(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_cooperative_admin)],
) -> list[BusStaffRead]:
    """Conductores y controladores de la cooperativa con su bus asignado."""
    return [
        service.to_bus_staff_read(db, staff, email)
        for staff, email in service.list_bus_staff(
            db, cooperative_id=cooperative_id_of(account)
        )
    ]


@router.get("/{bus_staff_id}", response_model=BusStaffRead)
def read_bus_staff(
    bus_staff_id: int,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_cooperative_admin)],
) -> BusStaffRead:
    try:
        staff, email = service.get_bus_staff_member(
            db,
            cooperative_id=cooperative_id_of(account),
            bus_staff_id=bus_staff_id,
        )
    except service.BusStaffError as exc:
        raise_bus_staff_error(exc)
    return service.to_bus_staff_read(db, staff, email)


@router.post("", response_model=BusStaffRead, status_code=status.HTTP_201_CREATED)
def create_bus_staff(
    payload: BusStaffCreate,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_cooperative_admin)],
    _: Annotated[None, Depends(validate_request_origin)],
) -> BusStaffRead:
    """Crea la cuenta de un conductor o controlador con su bus asignado."""
    try:
        staff, email = service.create_bus_staff(
            db,
            cooperative_id=cooperative_id_of(account),
            data=payload,
        )
    except service.BusStaffError as exc:
        raise_bus_staff_error(exc)
    return service.to_bus_staff_read(db, staff, email)


@router.patch("/{bus_staff_id}", response_model=BusStaffRead)
def update_bus_staff(
    bus_staff_id: int,
    payload: BusStaffUpdate,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(require_cooperative_admin)],
    _: Annotated[None, Depends(validate_request_origin)],
) -> BusStaffRead:
    """Edita los datos, cambia el bus asignado o activa y desactiva la cuenta."""
    try:
        staff, email = service.update_bus_staff(
            db,
            cooperative_id=cooperative_id_of(account),
            bus_staff_id=bus_staff_id,
            data=payload,
        )
    except service.BusStaffError as exc:
        raise_bus_staff_error(exc)
    return service.to_bus_staff_read(db, staff, email)


@bus_staff_self_router.get("/me", response_model=BusStaffSelfRead)
def read_my_bus_staff_profile(
    staff: Annotated[Staff, Depends(require_bus_staff)],
    db: Annotated[Session, Depends(get_db)],
) -> BusStaffSelfRead:
    """Datos del conductor o controlador que inició sesión y su bus asignado."""
    return service.to_bus_staff_self_read(db, staff)
