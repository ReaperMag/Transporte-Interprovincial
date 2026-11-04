import smtplib

from pydantic import SecretStr

from app.core.config import settings
from app.modules.notifications.providers import smtp
from app.modules.notifications.providers.smtp import EmailContent, send_email


CONTENT = EmailContent(subject="Asunto", text="Código: 123456", html="<p>Código: 123456</p>")


class RecordingSMTP:
    """Servidor simulado que registra cómo se usó."""

    instances: list["RecordingSMTP"] = []

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.calls: list[str] = []
        self.messages = []
        RecordingSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def starttls(self, context=None):
        self.calls.append("starttls")

    def login(self, user, password):
        self.calls.append(f"login:{user}")

    def send_message(self, message):
        self.messages.append(message)


def enable_smtp(monkeypatch, port=587):
    RecordingSMTP.instances = []
    monkeypatch.setattr(settings, "email_enabled", True)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", port)
    monkeypatch.setattr(settings, "smtp_user", "sistema@example.com")
    monkeypatch.setattr(settings, "smtp_password", SecretStr("clave"))
    monkeypatch.setattr(smtp.smtplib, "SMTP", RecordingSMTP)
    monkeypatch.setattr(smtp.smtplib, "SMTP_SSL", RecordingSMTP)


def test_disabled_email_is_written_to_the_log(caplog):
    caplog.set_level("INFO")

    assert send_email("ana@example.com", CONTENT) is False
    assert "EMAIL_ENABLED=false" in caplog.text
    assert "ana@example.com" in caplog.text
    assert "Código: 123456" in caplog.text


def test_sends_with_starttls_and_login(monkeypatch):
    enable_smtp(monkeypatch)

    assert send_email("ana@example.com", CONTENT) is True

    [server] = RecordingSMTP.instances
    assert (server.host, server.port) == ("smtp.example.com", 587)
    assert server.timeout == smtp.SMTP_TIMEOUT_SECONDS
    assert server.calls == ["starttls", "login:sistema@example.com"]
    [message] = server.messages
    assert message["From"] == "sistema@example.com"
    assert message["To"] == "ana@example.com"
    assert message.get_content_type() == "multipart/alternative"


def test_uses_smtp_from_when_configured(monkeypatch):
    enable_smtp(monkeypatch)
    monkeypatch.setattr(settings, "smtp_from", "Transporte <no-responder@example.com>")

    send_email("ana@example.com", CONTENT)

    assert RecordingSMTP.instances[0].messages[0]["From"] == "Transporte <no-responder@example.com>"


def test_port_465_uses_ssl_without_starttls(monkeypatch):
    enable_smtp(monkeypatch, port=465)

    assert send_email("ana@example.com", CONTENT) is True
    assert RecordingSMTP.instances[0].calls == ["login:sistema@example.com"]


def test_missing_host_does_not_send(monkeypatch, caplog):
    enable_smtp(monkeypatch)
    monkeypatch.setattr(settings, "smtp_host", "")

    assert send_email("ana@example.com", CONTENT) is False
    assert RecordingSMTP.instances == []
    assert "Configura SMTP_HOST" in caplog.text


def test_smtp_errors_are_logged_and_never_raised(monkeypatch, caplog):
    enable_smtp(monkeypatch)

    def broken_server(*args, **kwargs):
        raise smtplib.SMTPConnectError(421, "Servicio no disponible")

    monkeypatch.setattr(smtp.smtplib, "SMTP", broken_server)

    assert send_email("ana@example.com", CONTENT) is False
    assert "No se pudo enviar el correo a ana@example.com." in caplog.text
    assert "clave" not in caplog.text
