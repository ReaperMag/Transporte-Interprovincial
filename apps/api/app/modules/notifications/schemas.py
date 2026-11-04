from datetime import datetime

from pydantic import BaseModel

from app.modules.notifications.models import NotificationEvent


class NotificationRead(BaseModel):
    id: int
    event: NotificationEvent
    title: str
    message: str
    reservationId: int | None
    createdAt: datetime
    readAt: datetime | None
