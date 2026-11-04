
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.modules.accounts.models import Account
from app.modules.passengers import repository
from app.modules.passengers.models import Passenger
from app.modules.passengers.schemas import PassengerProfileUpdate


class DuplicatePassengerEmailError(Exception):
    pass


def update_passenger_profile(
    db: Session,
    account: Account,
    payload: PassengerProfileUpdate,
) -> Passenger | None:
    """
    Actualiza únicamente los campos enviados del perfil.

    Si cambia el correo, también actualiza la cuenta
    utilizada para iniciar sesión.
    """
    passenger = repository.get_passenger_by_account_id(
        db, account.id
    )

    if passenger is None:
        return None

    changes = payload.model_dump(exclude_unset=True)

    if "email" in changes:
        new_email = str(changes["email"]).strip().lower()

        existing_account_id = db.scalar(
            select(Account.id).where(
                func.lower(Account.email) == new_email,
                Account.id != account.id,
            )
        )

        if existing_account_id is not None:
            raise DuplicatePassengerEmailError(
                "El correo electrónico ya está registrado."
            )

        account.email = new_email
        passenger.email = new_email

    if "firstName" in changes:
        passenger.first_name = changes["firstName"]

    if "lastName" in changes:
        passenger.last_name = changes["lastName"]

    if "birthDate" in changes:
        passenger.birth_date = changes["birthDate"]

    if "phone" in changes:
        passenger.phone = changes["phone"]

    if "category" in changes:
        new_category = changes["category"]

        if new_category != passenger.category:
            passenger.category = new_category
            passenger.category_verified = False

    try:
        db.commit()

    except IntegrityError as exc:
        db.rollback()

        if "email" in changes:
            raise DuplicatePassengerEmailError(
                "No se pudo utilizar el correo electrónico indicado."
            ) from exc

        raise

    except SQLAlchemyError:
        db.rollback()
        raise

    db.refresh(passenger)
    db.refresh(account)

    return passenger
