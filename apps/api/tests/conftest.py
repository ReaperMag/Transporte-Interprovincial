
import re
import smtplib
from email.message import EmailMessage

import pytest
from pydantic import SecretStr
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import get_db, import_models
from app.main import app
from app.modules.accounts.repository import get_account_by_email
from app.modules.notifications.providers import smtp as smtp_provider
from app.shared.base_model import Base


TEST_JWT_SECRET_KEY = "clave-de-pruebas-con-al-menos-32-bytes-0123456789"


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch):
    """Fija la configuración de las pruebas para no depender del .env de cada integrante."""

    monkeypatch.setattr(settings, "jwt_secret_key", TEST_JWT_SECRET_KEY)
    # Nunca se envían correos reales durante las pruebas.
    monkeypatch.setattr(settings, "email_enabled", False)
    monkeypatch.setattr(settings, "smtp_host", None)
    monkeypatch.setattr(settings, "smtp_user", None)
    monkeypatch.setattr(settings, "smtp_password", None)
    monkeypatch.setattr(settings, "smtp_from", None)


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


class FakeSMTP:
    """
    Reemplaza a smtplib.SMTP: guarda los mensajes en lugar de enviarlos.

    Con fail = True simula que el servidor rechaza el envío.
    """

    def __init__(self, outbox: list[EmailMessage], fail: bool):
        self.outbox = outbox
        self.fail = fail

    def __call__(self, *args, **kwargs):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def starttls(self, **kwargs):
        pass

    def login(self, user, password):
        pass

    def send_message(self, message: EmailMessage):
        if self.fail:
            raise smtplib.SMTPServerDisconnected("Servidor SMTP simulado no disponible.")
        self.outbox.append(message)


class FakeMailServer:
    """Correos enviados durante una prueba y utilidades para leerlos."""

    def __init__(self):
        self.outbox: list[EmailMessage] = []
        self.fail = False

    def text(self, message: EmailMessage) -> str:
        return message.get_body(preferencelist=("plain",)).get_content()

    def sent_to(self, email: str) -> list[EmailMessage]:
        return [message for message in self.outbox if message["To"] == email]

    def last_code(self, email: str) -> str:
        """Código de 6 dígitos del último correo enviado a la dirección."""
        text = self.text(self.sent_to(email)[-1])
        return re.search(r"Código: (\d{6})", text).group(1)


@pytest.fixture
def fake_smtp(monkeypatch):
    """Activa el envío de correos con un servidor SMTP simulado."""

    server = FakeMailServer()
    monkeypatch.setattr(settings, "email_enabled", True)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_user", "sistema@example.com")
    monkeypatch.setattr(settings, "smtp_password", SecretStr("clave-de-prueba"))
    monkeypatch.setattr(
        smtp_provider.smtplib,
        "SMTP",
        lambda *args, **kwargs: FakeSMTP(server.outbox, server.fail),
    )
    return server


@pytest.fixture
def verify_account(test_environment):
    """
    Marca como verificado el correo de una cuenta registrada en la prueba.

    El registro público deja la cuenta pendiente de verificación; las pruebas
    que solo necesitan iniciar sesión lo usan para omitir el paso del código.
    """
    _, engine = test_environment

    def _verify(email: str) -> None:
        with Session(engine) as db:
            account = get_account_by_email(db, email)
            account.is_email_verified = True
            db.commit()

    return _verify


@pytest.fixture
def signup_data():
    """Datos válidos para registrar un pasajero."""
    return {
        "firstName": "Ana",
        "lastName": "Perez",
        "idNumber": "1712345675",
        "email": "ana@example.com",
        "password": "ClaveSegura123!",
        "confirmPassword": "ClaveSegura123!",
    }
