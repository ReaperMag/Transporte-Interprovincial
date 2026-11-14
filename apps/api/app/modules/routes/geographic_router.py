from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account
from app.modules.routes import geographic_service
from app.modules.routes.ecuador_geography import ECUADOR_PROVINCES
from app.modules.routes.geographic_schemas import GeographicCatalogRead


router = APIRouter(
    prefix="/geographic-catalog",
    tags=["Geographic catalog"],
)


@router.get("", response_model=GeographicCatalogRead)
def read_geographic_catalog(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[Account, Depends(get_current_account)],
) -> GeographicCatalogRead:
    return {
        "provinces": ECUADOR_PROVINCES,
        "cantons": geographic_service.list_catalog_cantons(db),
    }
