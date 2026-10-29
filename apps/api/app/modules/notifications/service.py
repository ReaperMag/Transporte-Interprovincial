from sqlalchemy.orm import Session

from app.modules.notifications.models import Notification, NotificationEvent


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
