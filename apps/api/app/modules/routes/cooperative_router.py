from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import (
    require_admin_access,
    require_cooperative_access,
    require_cooperative_admin,
)
from app.modules.accounts.models import Account
from app.modules.routes import cooperative_service, geographic_service
from app.modules.routes.cooperative_schemas import (
    CityCreate,
    CityRead,
    CooperativeRouteCreate,
    CooperativeRouteRead,
    RouteFareSave,
)


router = APIRouter(
    prefix="/cooperatives/me/route-planning",
    tags=["Cooperative - Route planning"],
)


def _cooperative_id(account: Account) -> int:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    return account.cooperative_id


@router.get("/cities", response_model=list[CityRead])
def read_cities(
    db: Session = Depends(get_db),
    _: Account = Depends(require_cooperative_admin),
) -> list[CityRead]:
    return cooperative_service.list_cities(db)


@router.post("/cities", response_model=CityRead, status_code=status.HTTP_201_CREATED)
def add_city(
    payload: CityCreate,
    db: Session = Depends(get_db),
    _: Account = Depends(require_admin_access),
    __: None = Depends(validate_request_origin),
) -> CityRead:
    try:
        return geographic_service.create_canton(db, payload.name, payload.province)
    except geographic_service.UnknownProvinceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Selecciona una provincia de Ecuador.",
        ) from exc
    except geographic_service.DuplicateCantonError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ese cantón ya está registrado en la provincia seleccionada.",
        ) from exc


@router.get("/routes", response_model=list[CooperativeRouteRead])
def read_routes(
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
) -> list[CooperativeRouteRead]:
    return cooperative_service.list_routes(db, _cooperative_id(account))


@router.post(
    "/routes",
    response_model=CooperativeRouteRead,
    status_code=status.HTTP_201_CREATED,
)
def add_route(
    payload: CooperativeRouteCreate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> CooperativeRouteRead:
    try:
        return cooperative_service.create_route(
            db,
            _cooperative_id(account),
            payload,
        )
    except cooperative_service.CityNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Una ubicación seleccionada no existe o no está habilitada en el catálogo.",
        ) from exc


@router.put(
    "/routes/{route_id}/fares",
    response_model=CooperativeRouteRead,
)
def set_route_fares(
    route_id: int,
    payload: RouteFareSave,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> CooperativeRouteRead:
    try:
        return cooperative_service.save_route_fares(
            db,
            _cooperative_id(account),
            route_id,
            payload,
        )
    except cooperative_service.RouteNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ruta no existe o está inactiva.",
        ) from exc
    except cooperative_service.FareSegmentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc