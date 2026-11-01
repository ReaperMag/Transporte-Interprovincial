from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_cooperative_access
from app.modules.accounts.models import Account
from app.modules.schedules import cooperative_service
from app.modules.schedules.cooperative_schemas import (
    FrequencyCreate,
    FrequencyRead,
    RouteSheetRead,
    RouteSheetSave,
)


router = APIRouter(
    prefix="/cooperatives/me/route-planning",
    tags=["Cooperative - Schedules"],
)


def _cooperative_id(account: Account) -> int:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    return account.cooperative_id


def _schedule_error(error: Exception) -> HTTPException:
    if isinstance(error, cooperative_service.BusGroupNotFoundError):
        return HTTPException(status_code=404, detail="El grupo de buses no existe.")
    if isinstance(error, cooperative_service.RouteNotFoundError):
        return HTTPException(status_code=404, detail="La ruta no existe o está inactiva.")
    if isinstance(error, cooperative_service.RouteNotSchedulableError):
        return HTTPException(
            status_code=409,
            detail="La ruta necesita una duración registrada para crear frecuencias.",
        )
    if isinstance(error, cooperative_service.DuplicateFrequencyError):
        return HTTPException(
            status_code=409,
            detail="Ya existe esa frecuencia para la ruta y el grupo seleccionados.",
        )
    if isinstance(error, cooperative_service.FrequencyNotFoundError):
        return HTTPException(
            status_code=404,
            detail="Una frecuencia no existe, está inactiva o no pertenece al grupo.",
        )
    if isinstance(error, cooperative_service.RouteSheetNotFoundError):
        return HTTPException(status_code=404, detail="La hoja de ruta no existe.")
    if isinstance(error, cooperative_service.RouteSheetPublishedError):
        return HTTPException(
            status_code=409,
            detail="La hoja publicada ya inició, pasó su hora o no puede cambiar sus frecuencias.",
        )
    if isinstance(error, cooperative_service.RouteSheetHasReservationsError):
        return HTTPException(
            status_code=409,
            detail="No se puede cambiar una hoja con reservas existentes.",
        )
    if isinstance(error, cooperative_service.BusAssignmentError):
        return HTTPException(status_code=409, detail=str(error))
    raise error


@router.get("/frequencies", response_model=list[FrequencyRead])
def read_frequencies(
    group_id: int | None = Query(default=None, gt=0, alias="groupId"),
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
) -> list[FrequencyRead]:
    return cooperative_service.list_frequencies(
        db,
        _cooperative_id(account),
        group_id,
    )


@router.post(
    "/frequencies",
    response_model=FrequencyRead,
    status_code=status.HTTP_201_CREATED,
)
def add_frequency(
    payload: FrequencyCreate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> FrequencyRead:
    try:
        return cooperative_service.create_frequency(
            db,
            _cooperative_id(account),
            payload,
        )
    except (
        cooperative_service.BusGroupNotFoundError,
        cooperative_service.RouteNotFoundError,
        cooperative_service.RouteNotSchedulableError,
        cooperative_service.DuplicateFrequencyError,
    ) as exc:
        raise _schedule_error(exc) from exc


@router.get("/route-sheets", response_model=RouteSheetRead)
def read_route_sheet(
    group_id: int = Query(gt=0, alias="groupId"),
    service_date: date = Query(alias="serviceDate"),
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
) -> RouteSheetRead:
    try:
        return cooperative_service.get_route_sheet(
            db,
            _cooperative_id(account),
            group_id,
            service_date,
        )
    except cooperative_service.BusGroupNotFoundError as exc:
        raise _schedule_error(exc) from exc


@router.put("/route-sheets", response_model=RouteSheetRead)
def save_route_sheet(
    payload: RouteSheetSave,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> RouteSheetRead:
    try:
        return cooperative_service.save_route_sheet(
            db,
            _cooperative_id(account),
            payload,
        )
    except (
        cooperative_service.BusGroupNotFoundError,
        cooperative_service.FrequencyNotFoundError,
        cooperative_service.RouteSheetPublishedError,
        cooperative_service.RouteSheetHasReservationsError,
        cooperative_service.BusAssignmentError,
    ) as exc:
        raise _schedule_error(exc) from exc


@router.post("/route-sheets/{sheet_id}/publish", response_model=RouteSheetRead)
def publish_route_sheet(
    sheet_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> RouteSheetRead:
    try:
        return cooperative_service.publish_route_sheet(
            db,
            _cooperative_id(account),
            sheet_id,
        )
    except (
        cooperative_service.RouteSheetNotFoundError,
        cooperative_service.BusAssignmentError,
    ) as exc:
        raise _schedule_error(exc) from exc