
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.modules.login_attempts.service import (
    count_recent_failed_attempts,
    is_login_blocked,
    register_failed_login,
)


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
