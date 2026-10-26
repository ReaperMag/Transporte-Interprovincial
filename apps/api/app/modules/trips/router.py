from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account, AccountType
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
    origin_city_id: Annotated[int, Query(gt=0)],
    destination_city_id: Annotated[int, Query(gt=0)],
    travel_date: date,
):
    """
    Busca viajes programados por origen, destino y fecha.
    """

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
    )