"""
Envío de correos por SMTP con la biblioteca estándar de Python.

Lo usan todos los módulos que necesitan enviar correos. Nunca lanza
excepciones: si el envío falla, registra el error y devuelve False para
que la operación principal (registro, pago, compra) continúe.
"""

import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from app.core.config import settings


logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 10
SMTP_SSL_PORT = 465


@dataclass(frozen=True)
class EmailContent:
    """Contenido de un correo en texto plano y HTML."""

    subject: str
    text: str
    html: str


def _clean(value: str | None) -> str:
    """Trata los valores vacíos del .env como no configurados."""
    return (value or "").strip()


def _build_message(sender: str, to: str, content: EmailContent) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = content.subject
    message["From"] = sender
    message["To"] = to
    message.set_content(content.text)
    message.add_alternative(content.html, subtype="html")
    return message


def send_email(to: str, content: EmailContent) -> bool:
    """
    Envía un correo y devuelve True solo si el servidor SMTP lo aceptó.

    Con EMAIL_ENABLED=false no se envía nada: el contenido se escribe en
    la consola para poder probar en local sin configurar SMTP.
    """
    try:
        if not settings.email_enabled:
            logger.info(
                "EMAIL_ENABLED=false: el correo no se envió.\n"
                "Para: %s\nAsunto: %s\n\n%s",
                to,
                content.subject,
                content.text,
            )
            return False

        host = _clean(settings.smtp_host)
        user = _clean(settings.smtp_user)
        password = (
            settings.smtp_password.get_secret_value()
            if settings.smtp_password is not None
            else ""
        )
        sender = _clean(settings.smtp_from) or user

        if not host or not sender:
            logger.error(
                "Configura SMTP_HOST y SMTP_FROM (o SMTP_USER) para enviar correos. "
                "No se envió el correo a %s.",
                to,
            )
            return False

        message = _build_message(sender, to, content)
        context = ssl.create_default_context()

        if settings.smtp_port == SMTP_SSL_PORT:
            server = smtplib.SMTP_SSL(
                host,
                settings.smtp_port,
                timeout=SMTP_TIMEOUT_SECONDS,
                context=context,
            )
        else:
            server = smtplib.SMTP(host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS)

        with server:
            if settings.smtp_port != SMTP_SSL_PORT and settings.smtp_use_tls:
                server.starttls(context=context)
            if user and password:
                server.login(user, password)
            server.send_message(message)

        logger.info("Correo enviado a %s: %s", to, content.subject)
        return True

    except Exception:
        logger.exception("No se pudo enviar el correo a %s.", to)
        return False
