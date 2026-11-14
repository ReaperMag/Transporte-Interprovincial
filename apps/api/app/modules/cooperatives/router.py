from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.core.storage import InvalidUploadError, resolve_upload, save_upload
from app.core.csrf import validate_request_origin
from app.core.permissions import (
    require_admin_access,
    require_cooperative_access,
    require_cooperative_admin,
    get_office_staff,
)
from app.modules.accounts.models import Account
from app.modules.cooperatives import repository, service
from app.modules.roles_permissions.models import Role
from app.modules.roles_permissions.seed import COOPERATIVE_ADMIN_ROLE
from app.modules.accounts.models import AccountType
from app.modules.cooperatives.schemas import (
    AdminSummary,
    CooperativeAccountCreate,
    CooperativeCreate,
    CooperativeIdentity,
    CooperativeProfileRead,
    CooperativeProfileUpdate,
    CooperativeRouteFrequencySummary,
    CooperativeRead,
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
    account: Account = Depends(require_cooperative_admin),
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


@cooperative_router.post("/me/profile/logo", response_model=CooperativeProfileRead)
def upload_current_cooperative_logo(
    logo: UploadFile = File(...),
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_admin),
    _: None = Depends(validate_request_origin),
) -> CooperativeProfileRead:
    """Save one PNG/JPG logo for the authenticated cooperative administrator."""
    cooperative_id = account.cooperative_id
    if cooperative_id is None:
        raise HTTPException(status_code=403, detail="La cuenta no tiene cooperativa asociada.")
    cooperative = repository.get_cooperative(db, cooperative_id)
    if cooperative is None:
        raise HTTPException(status_code=403, detail="La cuenta no tiene cooperativa asociada.")

    old_logo_url = cooperative.logo_url
    saved_path = None
    try:
        saved_path = save_upload(
            logo,
            f"cooperatives/{cooperative_id}/logos",
            allowed_types={"image/jpeg", "image/png"},
        )
        file_name = Path(saved_path).name
        new_url = f"/api/v1/cooperatives/{cooperative_id}/logo/{file_name}"
        updated = service.update_cooperative(db, cooperative_id, {"logo_url": new_url})
    except InvalidUploadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        if saved_path is not None:
            try:
                resolve_upload(saved_path).unlink()
            except FileNotFoundError:
                pass
        raise

    # Remove only an old local logo of this same cooperative after the DB commit.
    prefix = f"/api/v1/cooperatives/{cooperative_id}/logo/"
    if old_logo_url and old_logo_url.startswith(prefix):
        old_file_name = old_logo_url[len(prefix):]
        if old_file_name and "/" not in old_file_name and "\\" not in old_file_name:
            try:
                resolve_upload(f"cooperatives/{cooperative_id}/logos/{old_file_name}").unlink()
            except FileNotFoundError:
                pass
    return updated


@cooperative_router.get("/{cooperative_id}/logo/{file_name}")
def read_cooperative_logo(
    cooperative_id: int,
    file_name: str,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> FileResponse:
    """Serve logos only to authorized members of the owning cooperative."""
    if account.account_type != AccountType.COOPERATIVE or account.cooperative_id != cooperative_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver este logotipo.")
    is_admin = account.role_id is not None and db.scalar(
        select(Role.id).where(Role.id == account.role_id, Role.code == COOPERATIVE_ADMIN_ROLE)
    ) is not None
    if not is_admin and get_office_staff(db, account) is None:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver este logotipo.")

    cooperative = repository.get_cooperative(db, cooperative_id)
    expected_url = f"/api/v1/cooperatives/{cooperative_id}/logo/{file_name}"
    if cooperative is None or cooperative.logo_url != expected_url:
        raise HTTPException(status_code=404, detail="Logotipo no encontrado.")
    try:
        return FileResponse(resolve_upload(f"cooperatives/{cooperative_id}/logos/{file_name}"))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Logotipo no encontrado.") from None


@cooperative_router.get(
    "/me/route-frequency-summary",
    response_model=CooperativeRouteFrequencySummary,
)
def read_current_cooperative_route_frequency_summary(
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
) -> CooperativeRouteFrequencySummary:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    return repository.get_route_frequency_summary(db, account.cooperative_id)


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
    db: Session = Depends(get_db),
) -> list[CooperativeRead]:
    return repository.list_cooperatives(db, search=search)


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