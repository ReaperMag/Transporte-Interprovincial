from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_admin_access
from app.modules.routes import geographic_service
from app.modules.routes.geographic_schemas import CantonCreate, LocalityCreate
from app.modules.routes.cooperative_schemas import CityRead


router = APIRouter(
    prefix="/admin/geographic-catalog",
    tags=["Admin - Geographic catalog"],
    dependencies=[Depends(require_admin_access)],
)


@router.post(
    "/cantons",
    response_model=CityRead,
    status_code=status.HTTP_201_CREATED,
)
def add_canton(
    payload: CantonCreate,
    db: Session = Depends(get_db),
    _: None = Depends(validate_request_origin),
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


@router.post(
    "/localities",
    response_model=CityRead,
    status_code=status.HTTP_201_CREATED,
)
def add_locality(
    payload: LocalityCreate,
    db: Session = Depends(get_db),
    _: None = Depends(validate_request_origin),
) -> CityRead:
    try:
        return geographic_service.create_locality(
            db,
            payload.name,
            payload.province,
            payload.canton,
        )
    except geographic_service.UnknownProvinceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Selecciona una provincia de Ecuador.",
        ) from exc
    except geographic_service.UnknownCantonError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Selecciona un cantón registrado en la provincia.",
        ) from exc
    except geographic_service.DuplicateLocalityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esa localidad ya está registrada en el cantón seleccionado.",
        ) from exc
