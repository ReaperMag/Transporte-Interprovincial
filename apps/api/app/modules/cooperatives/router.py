from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.csrf import validate_request_origin
from app.core.permissions import require_admin_access, require_cooperative_access
from app.modules.accounts.models import Account
from app.modules.cooperatives import repository, service
from app.modules.cooperatives.schemas import (
    AdminSummary,
    CooperativeAccountCreate,
    CooperativeCreate,
    CooperativeIdentity,
    CooperativeProfileRead,
    CooperativeProfileUpdate,
    CooperativeRead,
    CooperativeStatusUpdate,
    CooperativeUpdate,
)

cooperative_router = APIRouter(
    prefix="/cooperatives",
    tags=["Cooperative"],
)

router = APIRouter(
    prefix="/admin/cooperatives",
    tags=["Admin - Cooperatives"],
    dependencies=[Depends(require_admin_access)],
)


@cooperative_router.get("/me", response_model=CooperativeIdentity)
def read_current_cooperative(
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
) -> CooperativeIdentity:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )

    cooperative = repository.get_cooperative(db, account.cooperative_id)
    if cooperative is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    return cooperative


@cooperative_router.get("/me/profile", response_model=CooperativeProfileRead)
def read_current_cooperative_profile(
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
) -> CooperativeProfileRead:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )

    cooperative = repository.get_cooperative(db, account.cooperative_id)
    if cooperative is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    return cooperative


@cooperative_router.patch(
    "/me/profile",
    response_model=CooperativeProfileRead,
)
def update_current_cooperative_profile(
    payload: CooperativeProfileUpdate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> CooperativeProfileRead:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Envía al menos un campo para actualizar.",
        )
    try:
        return service.update_cooperative(db, account.cooperative_id, changes)
    except service.CooperativeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        ) from exc


@router.get("", response_model=list[CooperativeRead])
def read_cooperatives(
    search: str | None = Query(default=None, max_length=150),
    is_active: bool | None = Query(default=None, alias="isActive"),
    db: Session = Depends(get_db),
) -> list[CooperativeRead]:
    return repository.list_cooperatives(db, search=search, is_active=is_active)


@router.get("/summary", response_model=AdminSummary)
def read_admin_summary(db: Session = Depends(get_db)) -> AdminSummary:
    return repository.get_admin_summary(db)


@router.get("/{cooperative_id}", response_model=CooperativeRead)
def read_cooperative(
    cooperative_id: int,
    db: Session = Depends(get_db),
) -> CooperativeRead:
    cooperative = repository.get_cooperative(db, cooperative_id)
    if cooperative is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cooperativa no encontrada.")
    return cooperative


@router.post("", response_model=CooperativeRead, status_code=status.HTTP_201_CREATED)
def create_cooperative(
    payload: CooperativeAccountCreate,
    db: Session = Depends(get_db),
    _: None = Depends(validate_request_origin),
) -> CooperativeRead:
    try:
        values = payload.model_dump(
            exclude={"account_email", "initial_password"}
        )
        return service.create_cooperative_with_account(
            db,
            values,
            account_email=str(payload.account_email),
            initial_password=payload.initial_password,
        )
    except service.DuplicateCooperativeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except service.DuplicateCooperativeAccountError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.put("/{cooperative_id}", response_model=CooperativeRead)
def replace_cooperative(
    cooperative_id: int,
    payload: CooperativeCreate,
    db: Session = Depends(get_db),
    _: None = Depends(validate_request_origin),
) -> CooperativeRead:
    try:
        return service.update_cooperative(db, cooperative_id, payload.model_dump())
    except service.CooperativeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cooperativa no encontrada.",
        ) from exc
    except service.DuplicateCooperativeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.patch("/{cooperative_id}", response_model=CooperativeRead)
def patch_cooperative(
    cooperative_id: int,
    payload: CooperativeUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(validate_request_origin),
) -> CooperativeRead:
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Envía al menos un campo para actualizar.",
        )
    try:
        return service.update_cooperative(db, cooperative_id, changes)
    except service.CooperativeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cooperativa no encontrada.",
        ) from exc
    except service.DuplicateCooperativeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.patch("/{cooperative_id}/status", response_model=CooperativeRead)
def change_cooperative_status(
    cooperative_id: int,
    payload: CooperativeStatusUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(validate_request_origin),
) -> CooperativeRead:
    try:
        return service.update_cooperative(
            db,
            cooperative_id,
            {"is_active": payload.is_active},
        )
    except service.CooperativeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cooperativa no encontrada.",
        ) from exc


@router.delete("/{cooperative_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_cooperative(
    cooperative_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(validate_request_origin),
) -> Response:
    try:
        service.delete_cooperative(db, cooperative_id)
    except service.CooperativeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cooperativa no encontrada.",
        ) from exc
    except service.CooperativeInUseError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)