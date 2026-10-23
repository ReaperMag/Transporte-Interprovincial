
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.accounts.models import Account, AccountType


def get_account_by_email(db: Session, email: str) -> Account | None:
    """
    Busca una cuenta por correo electrónico.

    Devuelve la cuenta si existe o None si no existe.
    La comparación no distingue mayúsculas de minúsculas.
    """
    normalized_email = email.strip().lower()

    statement = select(Account).where(
        func.lower(Account.email) == normalized_email
    )

    return db.scalar(statement)


def create_account(
    db: Session,
    *,
    email: str,
    password_hash: str,
    account_type: AccountType,
    cooperative_id: int | None = None,
) -> Account:
    """
    Agrega una cuenta a la sesión de base de datos.

    No realiza commit porque la transacción será controlada
    por el servicio de autenticación.
    """
    account = Account(
        email=email.strip().lower(),
        password_hash=password_hash,
        account_type=account_type,
        cooperative_id=cooperative_id,
    )

    db.add(account)
    db.flush()

    return account

def get_account_by_id(db: Session, account_id: int) -> Account | None:
    """Busca una cuenta existente mediante su identificador."""
    return db.get(Account, account_id)
