"""
Envía por correo las notificaciones después de guardarlas.

notify() deja la notificación pendiente en la sesión. Cuando la transacción
se confirma (after_commit), se envía un correo con el mismo título y mensaje
y, si el envío fue exitoso, se guarda email_sent_at. Si la transacción se
revierte, no se envía nada. Así ningún módulo repite esta lógica y un correo
nunca anuncia una compra o un pago que no se guardó.
"""

import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import event, update
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session

from app.modules.accounts.models import Account
from app.modules.notifications.models import Notification
from app.modules.notifications.providers.smtp import send_email
from app.modules.notifications.templates.emails import notification_email
from app.modules.trips.service import ECUADOR_TIMEZONE


logger = logging.getLogger(__name__)

# Notificaciones agregadas a la sesión que aún no tienen id.
PENDING_KEY = "notifications_pending_email"
# Notificaciones ya escritas en la base, listas para enviarse al confirmar.
READY_KEY = "notifications_ready_email"


@dataclass(frozen=True)
class NotificationEmail:
    notification_id: int
    account_id: int
    title: str
    message: str


def queue_notification_email(db: Session, notification: Notification) -> None:
    """Programa el envío del correo de una notificación para cuando se confirme."""
    db.info.setdefault(PENDING_KEY, []).append(notification)


@event.listens_for(Session, "after_flush")
def _collect_flushed_notifications(session: Session, _flush_context) -> None:
    # Después del flush cada notificación ya tiene id. Se copian sus datos
    # porque tras el commit los objetos pueden quedar expirados.
    pending = session.info.get(PENDING_KEY)
    if not pending:
        return

    ready = session.info.setdefault(READY_KEY, [])
    waiting = []
    for notification in pending:
        if notification.id is None:
            waiting.append(notification)
            continue
        ready.append(
            NotificationEmail(
                notification_id=notification.id,
                account_id=notification.account_id,
                title=notification.title,
                message=notification.message,
            )
        )
    session.info[PENDING_KEY] = waiting


@event.listens_for(Session, "after_rollback")
def _discard_notification_emails(session: Session) -> None:
    session.info.pop(PENDING_KEY, None)
    session.info.pop(READY_KEY, None)


@event.listens_for(Session, "after_commit")
def _send_committed_notification_emails(session: Session) -> None:
    emails = session.info.pop(READY_KEY, None)
    if not emails:
        return

    try:
        bind = session.get_bind()
    except Exception:
        logger.exception("No se pudieron enviar los correos de las notificaciones.")
        return

    deliver_notification_emails(bind, emails)


def deliver_notification_emails(
    bind: Engine | Connection,
    emails: list[NotificationEmail],
) -> None:
    """
    Envía los correos en una sesión aparte, porque la original ya terminó su
    transacción. Un fallo solo se registra: email_sent_at queda vacío.
    """
    with Session(bind) as db:
        for email in emails:
            try:
                account = db.get(Account, email.account_id)
                if account is None or not account.is_active:
                    continue

                sent = send_email(
                    account.email,
                    notification_email(email.title, email.message),
                )
                if not sent:
                    continue

                db.execute(
                    update(Notification)
                    .where(Notification.id == email.notification_id)
                    .values(email_sent_at=datetime.now(ECUADOR_TIMEZONE))
                )
                db.commit()
            except Exception:
                db.rollback()
                logger.exception(
                    "No se pudo registrar el correo de la notificación %s.",
                    email.notification_id,
                )
