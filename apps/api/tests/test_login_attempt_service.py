
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.modules.login_attempts.service import (
    count_recent_failed_attempts,
    is_login_blocked,
    register_failed_login,
)
from sqlalchemy import create_engine
from app.modules.login_attempts.models import LoginFailedAttempt

EMAIL = "ana@example.com"
IP = "192.0.2.10"


def test_registers_failed_attempts(test_environment):
    _, engine = test_environment

    with Session(engine) as db:
        register_failed_login(db, EMAIL, IP)

        assert count_recent_failed_attempts(
            db, EMAIL, IP
        ) == 1


def test_blocks_after_five_failures(test_environment):
    _, engine = test_environment

    with Session(engine) as db:
        for _ in range(5):
            register_failed_login(db, EMAIL, IP)

        assert is_login_blocked(db, EMAIL, IP)


def test_different_ip_has_independent_count(test_environment):
    _, engine = test_environment

    with Session(engine) as db:
        for _ in range(5):
            register_failed_login(db, EMAIL, IP)

        assert is_login_blocked(db, EMAIL, IP)

        assert not is_login_blocked(
            db, EMAIL, "192.0.2.11"
        )


def test_attempts_expire_after_fifteen_minutes(test_environment):
    _, engine = test_environment

    initial_time = datetime(
        2026, 10, 20, 10, 0, 0,
        tzinfo=timezone.utc,
    )

    with Session(engine) as db:
        for _ in range(5):
            register_failed_login(
                db, EMAIL, IP, now=initial_time
            )

        assert is_login_blocked(
            db, EMAIL, IP, now=initial_time
        )

        later = initial_time + timedelta(minutes=16)

        assert not is_login_blocked(
            db, EMAIL, IP, now=later
        )


def test_attempts_persist_between_sessions(test_environment):
    _, engine = test_environment

    with Session(engine) as first_session:
        register_failed_login(
            first_session, EMAIL, IP
        )

    with Session(engine) as second_session:
        assert count_recent_failed_attempts(
            second_session, EMAIL, IP
        ) == 1

def test_failed_attempts_persist_after_database_reopen(tmp_path):
    """Comprueba la persistencia en un archivo SQLite real."""

    database_path = tmp_path / "login_attempts_test.db"
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"

    email = "persistencia@example.com"
    ip_address = "192.0.2.50"

    # Primera conexión: crear la tabla y registrar cinco fallos.
    first_engine = create_engine(database_url)

    try:
        LoginFailedAttempt.__table__.create(
            bind=first_engine,
            checkfirst=True,
        )

        with Session(first_engine) as db:
            for _ in range(5):
                register_failed_login(
                    db,
                    email,
                    ip_address,
                )

            assert is_login_blocked(
                db,
                email,
                ip_address,
            )
    finally:
        first_engine.dispose()

    # Segunda conexión: abrir nuevamente el archivo SQLite.
    second_engine = create_engine(database_url)

    try:
        with Session(second_engine) as db:
            assert count_recent_failed_attempts(
                db,
                email,
                ip_address,
            ) == 5

            assert is_login_blocked(
                db,
                email,
                ip_address,
            )
    finally:
        second_engine.dispose()
