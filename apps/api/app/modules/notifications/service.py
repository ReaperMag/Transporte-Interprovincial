from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.notifications.models import Notification, NotificationEvent
from app.modules.trips.service import ECUADOR_TIMEZONE


def notify(
    db: Session,
    *,
    account_id: int | None,
    event: NotificationEvent,
    title: str,
    message: str,
    reservation_id: int | None = None,
) -> Notification | None:
    """
    Registra un aviso para la cuenta indicada.

    Las ventas en oficina no tienen cuenta de pasajero; en ese caso no se
    registra nada. No confirma la transacción: lo hace el servicio que llama.
    """
    if account_id is None:
        return None

    notification = Notification(
        account_id=account_id,
        event=event,
        title=title,
        message=message,
        reservation_id=reservation_id,
    )
    db.add(notification)
    return notification


def list_account_notifications(db: Session, account_id: int) -> list[Notification]:
    """Avisos de una cuenta, del más reciente al más antiguo."""
    return list(
        db.scalars(
            select(Notification)
            .where(Notification.account_id == account_id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
        ).all()
    )


def mark_as_read(db: Session, account_id: int, notification_id: int) -> Notification | None:
    """Marca un aviso como leído. Solo el dueño del aviso puede hacerlo."""
    notification = db.get(Notification, notification_id)
    if notification is None or notification.account_id != account_id:
        return None

    if notification.read_at is None:
        notification.read_at = datetime.now(ECUADOR_TIMEZONE)
        db.commit()
        db.refresh(notification)

    return notification
