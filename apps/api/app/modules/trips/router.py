from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.core.permissions import require_office_staff
from app.modules.accounts.models import Account, AccountType
from app.modules.staff.models import Staff
from app.modules.trips import service
from app.modules.trips.schemas import (
    CityOption,
    TripSearchResult,
)


router = APIRouter(
    prefix="/trips",
    tags=["Viajes"],
)


def require_passenger(
    account: Annotated[Account, Depends(get_current_account)],
) -> Account:
    """
    Permite consultar viajes desde una cuenta de pasajero.
    """
    if account.account_type != AccountType.PASSENGER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta operación es exclusiva para pasajeros.",
        )

    return account


@router.get(
    "/cities",
    response_model=list[CityOption],
)
def list_cities(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[Account, Depends(require_passenger)],
):
    """
    Devuelve las ciudades registradas.
    """
    return service.get_cities(db)


@router.get(
    "/search",
    response_model=list[TripSearchResult],
)
def search_available_trips(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[Account, Depends(require_passenger)],
    origin_city_id: Annotated[int | None, Query(gt=0)] = None,
    destination_city_id: Annotated[int | None, Query(gt=0)] = None,
    travel_date: date | None = None,
    end_date: date | None = None,
    include_past: bool = False,
):
    """
    Lista los viajes programados disponibles.

    Sin filtros devuelve todos; el origen, el destino y el rango de fechas son
    opcionales y sirven para reducir los resultados. Si include_past es True,
    incluye también viajes pasados para poder identificarlos y bloquearlos.
    """

    if (
        origin_city_id is not None
        and destination_city_id is not None
        and origin_city_id == destination_city_id
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El origen y el destino deben ser diferentes.",
        )
    if travel_date is not None and end_date is not None and end_date < travel_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La fecha final no puede ser anterior a la fecha inicial.",
        )

    return service.search_trips(
        db=db,
        origin_city_id=origin_city_id,
        destination_city_id=destination_city_id,
        travel_date=travel_date,
        end_date=end_date,
        include_past=include_past,
    )


@router.get(
    "/cities-for-sale",
    response_model=list[CityOption],
)
def list_office_cities(
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_office_staff)],
):
    return service.get_cities_for_cooperative(db, staff.cooperative_id)


@router.get(
    "/search-for-sale",
    response_model=list[TripSearchResult],
)
def search_office_trips(
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_office_staff)],
    origin_city_id: Annotated[int, Query(gt=0)],
    destination_city_id: Annotated[int, Query(gt=0)],
    travel_date: date,
):
    if origin_city_id == destination_city_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El origen y el destino deben ser diferentes.",
        )
    return service.search_trips(
        db=db,
        origin_city_id=origin_city_id,
        destination_city_id=destination_city_id,
        travel_date=travel_date,
        cooperative_id=staff.cooperative_id,
    )
