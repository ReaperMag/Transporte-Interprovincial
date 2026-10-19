
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.modules.accounts.models import AccountType
from app.modules.accounts.repository import (
    create_account,
    get_account_by_email,
)
from app.modules.auth.schemas import SignupRequest, SignupResponse
from app.modules.passengers.repository import (
    create_passenger,
    get_passenger_by_id_number,
)


class SignupConflictError(Exception):
    """Indica que los datos de registro entran en conflicto."""


def register_passenger(
    db: Session,
    data: SignupRequest,
) -> SignupResponse:
    """
    Registra una cuenta de pasajero y su perfil.

    Las dos operaciones se realizan en una sola transacción.
    Si ocurre un error, se revierten los cambios.
    """

    email = str(data.email).strip().lower()
    id_number = data.idNumber.strip().upper()

    try:
        # 1. Comprobar si ya existe el correo.
        if get_account_by_email(db, email) is not None:
            raise SignupConflictError(
                "El correo electrónico ya está registrado."
            )

        # 2. Comprobar si ya existe la identificación.
        if get_passenger_by_id_number(db, id_number) is not None:
            raise SignupConflictError(
                "La identificación ya tiene un registro previo."
            )

        # 3. Proteger la contraseña antes de almacenarla.
        password_hash = hash_password(data.password)

        # 4. Crear la cuenta exclusivamente como pasajero.
        account = create_account(
            db,
            email=email,
            password_hash=password_hash,
            account_type=AccountType.PASSENGER,
        )

        # 5. Crear el perfil relacionado con la cuenta.
        create_passenger(
            db,
            id_number=id_number,
            first_name=data.firstName,
            last_name=data.lastName,
            email=email,
            account_id=account.id,
        )

        # 6. Confirmar ambas operaciones.
        db.commit()

        # 7. Devolver solamente información pública.
        return SignupResponse(
            accountId=account.id,
            email=account.email,
            accountType="passenger",
        )

    except IntegrityError as error:
        # Revierte posibles inserciones ante conflictos de BD.
        db.rollback()
        raise SignupConflictError(
            "No se pudo completar el registro por un conflicto de datos."
        ) from error

    except Exception:
        # Evita conservar una transacción incompleta.
        db.rollback()
        raise
