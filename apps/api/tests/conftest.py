
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import get_db, import_models
from app.main import app
from app.shared.base_model import Base


@pytest.fixture
def test_environment():
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

    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.pop(get_db, None)
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
