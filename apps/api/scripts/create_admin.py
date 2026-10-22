"""Create the initial super-admin account from environment variables.

Usage (from apps/api):
    python scripts/create_admin.py
"""

import os
import sys
from pathlib import Path

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.exc import IntegrityError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from app.core.database import SessionLocal, init_db  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.modules.accounts.models import AccountType  # noqa: E402
from app.modules.accounts.repository import create_account, get_account_by_email  # noqa: E402


def main() -> None:
    raw_email = os.getenv("ADMIN_EMAIL", "").strip()
    password = os.getenv("ADMIN_PASSWORD", "")

    if not raw_email or not password:
        raise SystemExit("Define ADMIN_EMAIL y ADMIN_PASSWORD antes de ejecutar el script.")
    if len(password) < 12 or len(password) > 128:
        raise SystemExit("ADMIN_PASSWORD debe tener entre 12 y 128 caracteres.")

    try:
        email = str(TypeAdapter(EmailStr).validate_python(raw_email)).lower()
    except ValidationError as error:
        raise SystemExit("ADMIN_EMAIL no es un correo válido.") from error

    init_db()
    with SessionLocal() as db:
        if get_account_by_email(db, email) is not None:
            raise SystemExit(
                "Ya existe una cuenta con ese correo; no se modificó ni promovió."
            )

        try:
            create_account(
                db,
                email=email,
                password_hash=hash_password(password),
                account_type=AccountType.SUPER_ADMIN,
            )
            db.commit()
        except IntegrityError as error:
            db.rollback()
            raise SystemExit(
                "No se creó la cuenta administradora por un conflicto de datos."
            ) from error

    print(f"Cuenta administradora creada: {email}")


if __name__ == "__main__":
    main()
