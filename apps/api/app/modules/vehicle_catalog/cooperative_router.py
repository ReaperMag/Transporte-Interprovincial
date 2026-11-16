
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_cooperative_access
from app.modules.routes.ecuador_geography import ECUADOR_PROVINCES
from app.modules.vehicle_catalog import service
from app.modules.vehicle_catalog.catalog_data import BODYWORK_PROVINCE_CAPITALS
from app.modules.vehicle_catalog.models import BodyworkBrand, ChassisBrand
from app.modules.vehicle_catalog.schemas import VehicleCatalogRead


router = APIRouter(
    prefix="/cooperatives/me/vehicle-catalog",
    tags=["Cooperative - Vehicle catalog"],
    dependencies=[Depends(require_cooperative_access)],
)


@router.get("", response_model=VehicleCatalogRead)
def read_cooperative_vehicle_catalog(
    db: Session = Depends(get_db),
) -> VehicleCatalogRead:
    """
    Permite a Cooperativa consultar los catálogos globales.

    Los registros son administrados exclusivamente desde el
    panel Administrador. Esta ruta no permite modificarlos.
    """
    return VehicleCatalogRead(
        chassis=service.list_items(db, ChassisBrand),
        bodyworks=service.list_items(db, BodyworkBrand),
        bodywork_locations=sorted(
            {
                capital
                for province, capital in BODYWORK_PROVINCE_CAPITALS.items()
                if province in ECUADOR_PROVINCES
            }
        ),
    )
