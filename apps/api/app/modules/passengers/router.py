
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account, AccountType
from app.modules.passengers import repository, service
from app.modules.passengers.models import Passenger
from app.modules.passengers.schemas import (
    PassengerProfileResponse,
    PassengerProfileUpdate,
)


router = APIRouter(
    prefix="/passengers",
    tags=["Pasajeros"],
)


def require_passenger_account(account: Account) -> None:
    """
    Verifica que la cuenta autenticada sea de pasajero.
    """
    if account.account_type != AccountType.PASSENGER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta operación es exclusiva para pasajeros.",
        )


def build_profile_response(
    account: Account,
    passenger: Passenger | None,
) -> PassengerProfileResponse:
    """
    Construye la respuesta del perfil del pasajero.
    """
    return PassengerProfileResponse(
        accountId=account.id,
        email=account.email,
        hasPassengerProfile=passenger is not None,
        idNumber=passenger.id_number if passenger else None,
        firstName=passenger.first_name if passenger else None,
        lastName=passenger.last_name if passenger else None,
        birthDate=passenger.birth_date if passenger else None,
        phone=passenger.phone if passenger else None,
        category=passenger.category.value if passenger else None,
        categoryVerified=(
            passenger.category_verified if passenger else None
        ),
    )


@router.get(
    "/me",
    response_model=PassengerProfileResponse,
)
def get_my_profile(
    account: Annotated[Account, Depends(get_current_account)],
    db: Annotated[Session, Depends(get_db)],
):
    require_passenger_account(account)

    passenger = repository.get_passenger_by_account_id(
        db, account.id
    )

    return build_profile_response(account, passenger)


@router.patch(
    "/me",
    response_model=PassengerProfileResponse,
)
def update_my_profile(
    payload: PassengerProfileUpdate,
    account: Annotated[Account, Depends(get_current_account)],
    db: Annotated[Session, Depends(get_db)],
    _: None = Depends(validate_request_origin),
):
    require_passenger_account(account)

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Envía al menos un campo para actualizar.",
        )

    try:
        passenger = service.update_passenger_profile(
            db,
            account,
            payload,
        )
    except service.DuplicatePassengerEmailError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    if passenger is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil del pasajero no encontrado.",
        )

    return build_profile_response(account, passenger)
