
from sqlalchemy import create_engine, inspect

from app.core.database import import_models
from app.modules.login_attempts.models import LoginFailedAttempt
from app.shared.base_model import Base


def test_login_attempt_model_is_registered():
    import_models()

    assert (
        "login_failed_attempts"
        in Base.metadata.tables
    )


def test_login_attempt_table_can_be_created():
    import_models()

    engine = create_engine("sqlite+pysqlite:///:memory:")

    try:
        Base.metadata.create_all(bind=engine)

        inspector = inspect(engine)

        assert inspector.has_table("login_failed_attempts")

        columns = {
            column["name"]
            for column in inspector.get_columns(
                "login_failed_attempts"
            )
        }

        assert {
            "id",
            "email_key",
            "ip_key",
            "attempted_at",
            "created_at",
            "updated_at",
        }.issubset(columns)

    finally:
        engine.dispose()
