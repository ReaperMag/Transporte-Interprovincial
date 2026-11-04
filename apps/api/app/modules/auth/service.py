
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.modules.accounts.models import Account, AccountType
from app.modules.accounts.repository import (
    create_account,
    get_account_by_email,
)
from app.modules.auth.models import VerificationPurpose
from app.modules.auth.schemas import SignupRequest, SignupResponse
from app.modules.auth.tokens import create_access_token
from app.modules.auth.verification import (
    InvalidVerificationCodeError,
    can_issue_code,
    consume_code,
    issue_code,
    send_code_email,
)
from app.modules.passengers.linking import (
    GENERIC_MISMATCH_MESSAGE,
    PassengerLinkError,
    can_claim_passenger,
    link_pending_passenger,
)
from app.modules.passengers.repository import (
    create_passenger,
    get_passenger_by_id_number,
)


class SignupConflictError(Exception):
    """Indica que los datos de registro entran en conflicto."""


class InvalidCredentialsError(Exception):
    """Indica que las credenciales de acceso son inválidas."""


class EmailNotVerifiedError(Exception):
    """La contraseña es correcta, pero el pasajero aún no verifica su correo."""


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

        # 2. Comprobar si ya existe la identificación. Si viene de una venta
        #    en oficina (sin cuenta) y los datos coinciden, se reclama ese
        #    registro en lugar de crear otro.
        existing_passenger = get_passenger_by_id_number(db, id_number)
        if existing_passenger is not None:
            if existing_passenger.account_id is not None:
                raise SignupConflictError(
                    "La identificación ya tiene un registro previo."
                )
            if not can_claim_passenger(
                existing_passenger,
                first_name=data.firstName,
                last_name=data.lastName,
                email=email,
            ):
                raise SignupConflictError(GENERIC_MISMATCH_MESSAGE)

        # 3. Proteger la contraseña antes de almacenarla.
        password_hash = hash_password(data.password)

        # 4. Crear la cuenta exclusivamente como pasajero, pendiente de
        #    verificar su correo.
        account = create_account(
            db,
            email=email,
            password_hash=password_hash,
            account_type=AccountType.PASSENGER,
            is_email_verified=False,
        )

        # 5. Crear el perfil relacionado con la cuenta o, si la cédula viene
        #    de una venta en oficina, dejar la vinculación pendiente hasta
        #    que verifique su correo. Mientras tanto no ve esos viajes.
        if existing_passenger is not None:
            account.pending_passenger_id = existing_passenger.id
        else:
            create_passenger(
                db,
                id_number=id_number,
                first_name=data.firstName,
                last_name=data.lastName,
                email=email,
                account_id=account.id,
            )

        # 6. Generar el código de verificación.
        code = issue_code(db, account, VerificationPurpose.EMAIL_VERIFICATION)

        # 7. Confirmar las operaciones.
        db.commit()

        # 8. Enviar el código. Si el correo falla, la cuenta queda creada y
        #    el pasajero puede pedir que se reenvíe.
        send_code_email(account.email, VerificationPurpose.EMAIL_VERIFICATION, code)

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

    # Se comprueba después de validar la contraseña para no revelar el
    # estado de la cuenta a quien no la conoce.
    if (
        account.account_type == AccountType.PASSENGER
        and not account.is_email_verified
    ):
        raise EmailNotVerifiedError(
            "Tu cuenta aún no está verificada. Ingresa el código que enviamos "
            "a tu correo o solicita uno nuevo."
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


def _pending_passenger(db: Session, email: str) -> Account | None:
    """Pasajero activo que aún no verifica su correo."""
    account = get_account_by_email(db, email)
    if (
        account is None
        or not account.is_active
        or account.account_type != AccountType.PASSENGER
        or account.is_email_verified
    ):
        return None
    return account


def _complete_verification(db: Session, account: Account) -> None:
    """
    Marca la cuenta como verificada y, si reclamó el registro de una venta
    en oficina, concreta la vinculación para que vea sus viajes anteriores.

    Si la vinculación no es posible, se revierte todo: la cuenta no queda
    verificada sin perfil de pasajero.
    """
    account.is_email_verified = True
    try:
        link_pending_passenger(db, account)
    except PassengerLinkError:
        db.rollback()
        raise


def verify_email(db: Session, email: str, code: str) -> None:
    """
    Verifica el correo de un pasajero con el código recibido.

    Si la cuenta no existe o ya está verificada se responde igual que con un
    código inválido, para no revelar qué correos están registrados.
    """
    account = _pending_passenger(db, email)
    if account is None:
        raise InvalidVerificationCodeError(
            "El código no es válido o ya venció. Solicita uno nuevo."
        )

    consume_code(db, account, VerificationPurpose.EMAIL_VERIFICATION, code)
    _complete_verification(db, account)
    db.commit()


def resend_verification_code(db: Session, email: str) -> None:
    """
    Envía un nuevo código si la cuenta está pendiente y ya pasó la espera
    mínima. En cualquier otro caso no hace nada; la respuesta al cliente es
    siempre la misma.
    """
    account = _pending_passenger(db, email)
    if account is None or not can_issue_code(
        db, account, VerificationPurpose.EMAIL_VERIFICATION
    ):
        return

    code = issue_code(db, account, VerificationPurpose.EMAIL_VERIFICATION)
    db.commit()
    send_code_email(account.email, VerificationPurpose.EMAIL_VERIFICATION, code)


def request_password_reset(db: Session, email: str) -> None:
    """
    Envía un código de recuperación si la cuenta existe, está activa y ya
    pasó la espera mínima desde el último código. La respuesta al cliente
    es siempre la misma, exista o no la cuenta.
    """
    account = get_account_by_email(db, email)
    if (
        account is None
        or not account.is_active
        or not can_issue_code(db, account, VerificationPurpose.PASSWORD_RESET)
    ):
        return

    code = issue_code(db, account, VerificationPurpose.PASSWORD_RESET)
    db.commit()
    send_code_email(account.email, VerificationPurpose.PASSWORD_RESET, code)


def reset_password(db: Session, email: str, code: str, new_password: str) -> None:
    """
    Establece una nueva contraseña con un código de recuperación válido.

    El código queda usado. Recibirlo también demuestra que la persona
    controla el correo, por eso la cuenta queda verificada.
    """
    account = get_account_by_email(db, email)
    if account is None or not account.is_active:
        raise InvalidVerificationCodeError(
            "El código no es válido o ya venció. Solicita uno nuevo."
        )

    consume_code(db, account, VerificationPurpose.PASSWORD_RESET, code)
    account.password_hash = hash_password(new_password)
    _complete_verification(db, account)
    db.commit()
