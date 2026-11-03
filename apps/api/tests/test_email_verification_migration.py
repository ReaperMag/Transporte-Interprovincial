from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.core import database
from app.core.security import hash_password
from app.modules.auth.service import authenticate_account


PASSWORD = "ClaveExistente123!"


def test_existing_accounts_stay_verified_and_can_log_in(monkeypatch):
    """
    Una base creada antes de la verificación de correo no tiene la columna
    is_email_verified. Al iniciar, la migración la agrega y todas las cuentas
    existentes (administrador, cooperativa y pasajero) siguen entrando.
    """
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE accounts ("
                    "id INTEGER PRIMARY KEY, email VARCHAR(150) UNIQUE, "
                    "password_hash VARCHAR(255), account_type VARCHAR(30), "
                    "role_id INTEGER, cooperative_id INTEGER, is_active BOOLEAN, "
                    "last_login_at DATETIME, "
                    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                    "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
                )
            )
            for email, account_type in (
                ("admin@example.com", "super_admin"),
                ("cooperativa@example.com", "cooperative"),
                ("pasajero@example.com", "passenger"),
            ):
                connection.execute(
                    text(
                        "INSERT INTO accounts (email, password_hash, account_type, is_active) "
                        "VALUES (:email, :password_hash, :account_type, 1)"
                    ),
                    {
                        "email": email,
                        "password_hash": hash_password(PASSWORD),
                        "account_type": account_type,
                    },
                )
        monkeypatch.setattr(database, "engine", engine)

        database.init_db()
        # Volver a iniciar no debe fallar ni cambiar nada.
        database.init_db()

        columns = {column["name"] for column in inspect(engine).get_columns("accounts")}
        assert "is_email_verified" in columns
        assert "verification_codes" in inspect(engine).get_table_names()

        with Session(engine) as db:
            for email in (
                "admin@example.com",
                "cooperativa@example.com",
                "pasajero@example.com",
            ):
                account, token = authenticate_account(db, email, PASSWORD)
                assert account.is_email_verified
                assert token
    finally:
        engine.dispose()
