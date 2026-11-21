from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_bus_staff
from app.modules.sales import onboard_service as service
from app.modules.sales.onboard_schemas import (
    OnboardSaleCreate,
    OnboardSaleOptions,
    OnboardSaleRead,
)
from app.modules.staff.models import Staff
from app.modules.trips.bus_staff_router import raise_trip_error
from app.modules.trips.bus_staff_service import BusStaffTripError


router = APIRouter(prefix="/bus-staff/trips", tags=["Venta a bordo"])


def raise_sale_error(exc: BusStaffTripError) -> NoReturn:
    if isinstance(exc, service.OnboardSaleValidationError):
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    raise_trip_error(exc)


@router.get("/{trip_id}/onboard-sales/options", response_model=OnboardSaleOptions)
def read_onboard_sale_options(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
    origin_city_id: Annotated[int | None, Query(alias="originCityId", gt=0)] = None,
    destination_city_id: Annotated[int | None, Query(alias="destinationCityId", gt=0)] = None,
):
    """Paradas de la ruta, asientos libres y tarifa sugerida del tramo."""
    try:
        return service.get_onboard_sale_options(
            db, staff, trip_id, origin_city_id, destination_city_id
        )
    except BusStaffTripError as exc:
        raise_sale_error(exc)


@router.post(
    "/{trip_id}/onboard-sales",
    response_model=OnboardSaleRead,
    status_code=status.HTTP_201_CREATED,
)
def create_onboard_sale(
    trip_id: int,
    payload: OnboardSaleCreate,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
    _: Annotated[None, Depends(validate_request_origin)],
):
    """
    Registra un pasaje vendido a bordo, cobrado en efectivo. Si no se envía el
    precio, se cobra la tarifa del tramo con el descuento de la categoría.
    """
    try:
        ticket = service.create_onboard_sale(db, staff, trip_id, payload)
    except BusStaffTripError as exc:
        raise_sale_error(exc)
    return service.build_onboard_sale_read(db, ticket)
