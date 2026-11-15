from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_admin_access
from app.modules.vehicle_catalog import service
from app.modules.vehicle_catalog.models import BodyworkBrand, ChassisBrand
from app.modules.vehicle_catalog.schemas import (
    CatalogItemCreate,
    CatalogItemRead,
    CatalogItemUpdate,
    VehicleCatalogRead,
)


router = APIRouter(
    prefix="/admin/vehicle-catalog",
    tags=["Admin - Vehicle catalog"],
    dependencies=[Depends(require_admin_access)],
)


def _model(kind: str):
    if kind == "chassis":
        return ChassisBrand
    if kind == "bodyworks":
        return BodyworkBrand
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de catálogo no válido.")


@router.get("", response_model=VehicleCatalogRead)
def read_vehicle_catalog(db: Session = Depends(get_db)) -> VehicleCatalogRead:
    return VehicleCatalogRead(
        chassis=service.list_items(db, ChassisBrand),
        bodyworks=service.list_items(db, BodyworkBrand),
    )


@router.post("/{kind}", response_model=CatalogItemRead, status_code=status.HTTP_201_CREATED)
def create_vehicle_catalog_item(
    kind: str,
    payload: CatalogItemCreate,
    db: Session = Depends(get_db),
    _: None = Depends(validate_request_origin),
) -> CatalogItemRead:
    try:
        return service.create_item(db, _model(kind), payload.name)
    except service.DuplicateCatalogItemError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ese nombre ya está registrado.") from exc


@router.patch("/{kind}/{item_id}", response_model=CatalogItemRead)
def update_vehicle_catalog_item(
    kind: str,
    item_id: int,
    payload: CatalogItemUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(validate_request_origin),
) -> CatalogItemRead:
    try:
        return service.update_item(db, _model(kind), item_id, payload.name)
    except service.CatalogItemNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado.") from exc
    except service.DuplicateCatalogItemError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ese nombre ya está registrado.") from exc


@router.delete("/{kind}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle_catalog_item(
    kind: str,
    item_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(validate_request_origin),
) -> Response:
    try:
        service.delete_item(db, _model(kind), item_id)
    except service.CatalogItemNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado.") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
