from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account
from app.modules.notifications import service
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import NotificationRead


router = APIRouter(
    prefix="/notifications",
    tags=["Notificaciones"],
)


def build_notification_read(notification: Notification) -> NotificationRead:
    return NotificationRead(
        id=notification.id,
        event=notification.event,
        title=notification.title,
        message=notification.message,
        reservationId=notification.reservation_id,
        createdAt=notification.created_at,
        readAt=notification.read_at,
    )


@router.get(
    "/me",
    response_model=list[NotificationRead],
)
def list_my_notifications(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(get_current_account)],
):
    """Avisos de la cuenta autenticada sobre sus reservas y pagos."""
    return [
        build_notification_read(notification)
        for notification in service.list_account_notifications(db, account.id)
    ]


@router.post(
    "/{notification_id}/read",
    response_model=NotificationRead,
)
def mark_notification_as_read(
    notification_id: int,
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(get_current_account)],
    _: None = Depends(validate_request_origin),
):
    """Marca un aviso como leído."""
    notification = service.mark_as_read(db, account.id, notification_id)
    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aviso no encontrado.",
        )
    return build_notification_read(notification)
