from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import (
    require_cooperative_access,
    require_cooperative_admin,
)
from app.modules.accounts.models import Account
from app.modules.buses import seat_type_service
from app.modules.buses.schemas import (
    CooperativeSeatTypeCreate,
    CooperativeSeatTypeRead,
    CooperativeSeatTypeUpdate,
)


router = APIRouter(
    prefix="/cooperatives/me/seat-types",
    tags=["Cooperative - Seat types"],
)


def _require_cooperative_id(account: Account) -> int:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    return account.cooperative_id


@router.get("", response_model=list[CooperativeSeatTypeRead])
def list_cooperative_seat_types(
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
):
    cooperative_id = _require_cooperative_id(account)

    return seat_type_service.list_seat_types(
        db,
        cooperative_id,
    )


@router.get(
    "/{seat_type_id}",
    response_model=CooperativeSeatTypeRead,
)
def get_cooperative_seat_type(
    seat_type_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
):
    cooperative_id = _require_cooperative_id(account)

    seat_type = seat_type_service.get_seat_type(
        db,
        cooperative_id,
        seat_type_id,
    )

    if seat_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El tipo de asiento no existe.",
        )

    return seat_type


@router.post(
    "",
    response_model=CooperativeSeatTypeRead,
    status_code=status.HTTP_201_CREATED,
)
def create_cooperative_seat_type(
    payload: CooperativeSeatTypeCreate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_admin),
    _: None = Depends(validate_request_origin),
):
    cooperative_id = _require_cooperative_id(account)

    try:
        return seat_type_service.create_seat_type(
            db,
            cooperative_id,
            **payload.model_dump(),
        )
    except seat_type_service.DuplicateSeatTypeNameError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un tipo de asiento con ese nombre.",
        ) from exc


@router.patch(
    "/{seat_type_id}",
    response_model=CooperativeSeatTypeRead,
)
def update_cooperative_seat_type(
    seat_type_id: int,
    payload: CooperativeSeatTypeUpdate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_admin),
    _: None = Depends(validate_request_origin),
):
    cooperative_id = _require_cooperative_id(account)

    try:
        return seat_type_service.update_seat_type(
            db,
            cooperative_id,
            seat_type_id,
            payload.model_dump(exclude_unset=True),
        )

    except seat_type_service.SeatTypeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El tipo de asiento no existe.",
        ) from exc

    except seat_type_service.DuplicateSeatTypeNameError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un tipo de asiento con ese nombre.",
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{seat_type_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_cooperative_seat_type(
    seat_type_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_admin),
    _: None = Depends(validate_request_origin),
) -> None:
    cooperative_id = _require_cooperative_id(account)

    try:
        seat_type_service.delete_seat_type(
            db,
            cooperative_id,
            seat_type_id,
        )

    except seat_type_service.SeatTypeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El tipo de asiento no existe.",
        ) from exc

    except seat_type_service.SeatTypeInUseError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No se puede eliminar el tipo de asiento "
                "porque está siendo utilizado en una plantilla."
            ),
        ) from exc
