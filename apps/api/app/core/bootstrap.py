from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.accounts.repository import create_account, get_account_by_email


def ensure_initial_admin(db: Session) -> bool:
    """Create the initial super-admin only when the database has none."""
    existing_admin = db.scalar(
        select(Account.id)
        .where(Account.account_type == AccountType.SUPER_ADMIN)
        .limit(1)
    )
    if existing_admin is not None:
        return False

    if settings.admin_email is None or settings.admin_password is None:
        raise RuntimeError(
            "No existe un administrador. Configura ADMIN_EMAIL y ADMIN_PASSWORD "
            "en apps/api/.env para crear el administrador inicial."
        )

    email = str(settings.admin_email).strip().lower()
    password = settings.admin_password.get_secret_value()
    if len(password) < 12 or len(password) > 128:
        raise RuntimeError("ADMIN_PASSWORD debe tener entre 12 y 128 caracteres.")

    if get_account_by_email(db, email) is not None:
        raise RuntimeError(
            "ADMIN_EMAIL ya pertenece a otra cuenta y no se puede promover "
            "automáticamente a administrador."
        )

    try:
        create_account(
            db,
            email=email,
            password_hash=hash_password(password),
            account_type=AccountType.SUPER_ADMIN,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        existing_admin = db.scalar(
            select(Account.id)
            .where(Account.account_type == AccountType.SUPER_ADMIN)
            .limit(1)
        )
        if existing_admin is not None:
            return False
        raise RuntimeError(
            "No se pudo crear el administrador inicial por un conflicto de datos."
        ) from exc
    except Exception:
        db.rollback()
        raise

    return True
