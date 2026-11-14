from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_admin_access
from app.modules.routes import geographic_service
from app.modules.routes.ecuador_geography import ECUADOR_PROVINCES
from app.modules.routes.geographic_schemas import CantonCreate, GeographicCatalogRead
from app.modules.routes.cooperative_schemas import CityRead


router = APIRouter(
    prefix="/admin/geographic-catalog",
    tags=["Admin - Geographic catalog"],
    dependencies=[Depends(require_admin_access)],
)


@router.get("", response_model=GeographicCatalogRead)
def read_geographic_catalog(
    db: Session = Depends(get_db),
) -> GeographicCatalogRead:
    return {
        "provinces": ECUADOR_PROVINCES,
        "cantons": geographic_service.list_catalog_cantons(db),
    }


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
