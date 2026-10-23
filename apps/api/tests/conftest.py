
import pytest
from pydantic import SecretStr
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import get_db, import_models
from app.main import app
from app.shared.base_model import Base


@pytest.fixture
def test_environment(monkeypatch):
    """Crea una base SQLite temporal para cada prueba."""

    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    import_models()
    Base.metadata.create_all(bind=engine)

    monkeypatch.setattr(settings, "admin_email", "bootstrap-admin@example.com")
    monkeypatch.setattr(
        settings,
        "admin_password",
        SecretStr("TestBootstrapAdmin123!"),
    )
    previous_factory = getattr(app.state, "session_factory", None)
    previous_init_setting = getattr(app.state, "initialize_database_on_startup", None)
    app.state.session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )
    app.state.initialize_database_on_startup = False

    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.pop(get_db, None)
        if previous_factory is None:
            delattr(app.state, "session_factory")
        else:
            app.state.session_factory = previous_factory
        if previous_init_setting is None:
            delattr(app.state, "initialize_database_on_startup")
        else:
            app.state.initialize_database_on_startup = previous_init_setting
        engine.dispose()


@pytest.fixture
def signup_data():
    """Datos válidos para registrar un pasajero."""
    return {
        "firstName": "Ana",
        "lastName": "Perez",
        "idNumber": "1712345678",
        "email": "ana@example.com",
        "password": "ClaveSegura123!",
        "confirmPassword": "ClaveSegura123!",
    }
