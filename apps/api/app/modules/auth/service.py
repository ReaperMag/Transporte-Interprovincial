
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.modules.accounts.models import Account, AccountType
from app.modules.accounts.repository import (
    create_account,
    get_account_by_email,
)
from app.modules.auth.schemas import SignupRequest, SignupResponse
from app.modules.auth.tokens import create_access_token
from app.modules.passengers.repository import (
    create_passenger,
    get_passenger_by_id_number,
)


class SignupConflictError(Exception):
    """Indica que los datos de registro entran en conflicto."""


class InvalidCredentialsError(Exception):
    """Indica que las credenciales de acceso son inválidas."""


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


        return SignupResponse(
            accountId=account.id,
            email=account.email,
            accountType="passenger",
        )

    except IntegrityError as error:
        db.rollback()
        raise SignupConflictError(
            "No se pudo completar el registro por un conflicto de datos."
        ) from error

    except Exception:
        db.rollback()
        raise


def authenticate_passenger(
    db: Session,
    email: str,
    password: str,
) -> tuple[Account, str]:
    """
    Autentica un pasajero existente y genera un JWT.

    No crea cuentas ni modifica el registro.
    """

    account, access_token = _authenticate_account(
        db,
        email,
        password,
        accepted_types={AccountType.PASSENGER},
    )
    return account, access_token


def authenticate_account(
    db: Session,
    email: str,
    password: str,
) -> tuple[Account, str]:
    """Autentica una cuenta activa y genera un JWT."""
    return _authenticate_account(
        db,
        email,
        password,
        accepted_types=set(AccountType),
    )


def _authenticate_account(
    db: Session,
    email: str,
    password: str,
    *,
    accepted_types: set[AccountType],
) -> tuple[Account, str]:
    # Buscar la cuenta por correo y verificar las credenciales.
    account = get_account_by_email(db, email)

    if (
        account is None
        or not verify_password(password, account.password_hash)
        or not account.is_active
        or account.account_type not in accepted_types
    ):
        raise InvalidCredentialsError(
            "Correo o contraseña incorrectos."
        )

    access_token = create_access_token(
        account_id=account.id,
        account_type=account.account_type.value,
    )

    try:
        account.last_login_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(account)

    except Exception:
        db.rollback()
        raise

    return account, access_token
