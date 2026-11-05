"""
Envía por correo las notificaciones después de guardarlas.

notify() deja la notificación pendiente en la sesión. Cuando la transacción
se confirma (after_commit), se envía un correo con el mismo título y mensaje
y, si el envío fue exitoso, se guarda email_sent_at. Si la transacción se
revierte, no se envía nada. Si la notificación corresponde a boletos emitidos,
se genera y envía el correo con los detalles del viaje y códigos QR.
"""

import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import event, select, update
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session

from app.modules.accounts.models import Account
from app.modules.buses.models import Bus, TemplateSeat
from app.modules.cooperatives.models import Cooperative
from app.modules.notifications.models import Notification, NotificationEvent
from app.modules.notifications.providers.smtp import EmailContent, send_email
from app.modules.notifications.templates.emails import (
    notification_email,
    tickets_confirmation_email,
)
from app.modules.passengers.models import Passenger
from app.modules.reservations.models import Reservation, ReservationSeat
from app.modules.routes.models import City
from app.modules.tickets.generator import render_qr_png
from app.modules.tickets.models import Ticket
from app.modules.trips.models import Trip
from app.modules.trips.service import ECUADOR_TIMEZONE, as_local


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
    event: str | None = None
    reservation_id: int | None = None


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

        event_str = (
            notification.event.value
            if hasattr(notification.event, "value")
            else str(notification.event)
        )

        ready.append(
            NotificationEmail(
                notification_id=notification.id,
                account_id=notification.account_id,
                title=notification.title,
                message=notification.message,
                event=event_str,
                reservation_id=notification.reservation_id,
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


def _build_tickets_email_content(db: Session, reservation_id: int) -> EmailContent | None:
    """Construye el correo de confirmación de boletos con códigos QR."""
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        return None

    trip = db.get(Trip, reservation.trip_id)
    if trip is None:
        return None

    cooperative = db.get(Cooperative, trip.cooperative_id)
    bus = db.get(Bus, trip.bus_id)

    seat_ids = [s.id for s in reservation.seats]
    tickets = list(
        db.scalars(
            select(Ticket)
            .where(Ticket.reservation_seat_id.in_(seat_ids))
            .order_by(Ticket.id)
        ).all()
    )

    if not tickets:
        return None

    first_ticket = tickets[0]
    origin = db.get(City, first_ticket.origin_city_id)
    destination = db.get(City, first_ticket.destination_city_id)

    dep_dt = as_local(trip.departure_at)
    dep_str = dep_dt.strftime("%d/%m/%Y a las %H:%M")

    tickets_data: list[dict] = []
    for t in tickets:
        passenger = db.get(Passenger, t.passenger_id)
        seat = db.get(TemplateSeat, t.seat_id)

        qr_png = b""
        qr_cid = ""
        try:
            qr_png = render_qr_png(t.code)
            qr_cid = f"ticket-{t.id}@transporte-interprovincial"
        except Exception:
            logger.warning("No se pudo generar QR para boleto %s", t.code)

        tickets_data.append(
            {
                "ticket_code": t.code,
                "passenger_name": (
                    f"{passenger.first_name} {passenger.last_name}" if passenger else "Pasajero"
                ),
                "passenger_id_number": passenger.id_number if passenger else "",
                "seat_number": seat.number if seat else "",
                "seat_type": seat.seat_type.value if hasattr(seat.seat_type, "value") else str(seat.seat_type),
                "category": (
                    t.passenger_category.value
                    if hasattr(t.passenger_category, "value")
                    else str(t.passenger_category)
                ),
                "price": str(t.price),
                "qr_cid": qr_cid,
                "qr_png": qr_png,
            }
        )

    return tickets_confirmation_email(
        cooperative_name=cooperative.name if cooperative else "Transporte Interprovincial",
        origin_name=origin.name if origin else "Origen",
        destination_name=destination.name if destination else "Destino",
        departure_str=dep_str,
        bus_number=bus.number if bus else "1",
        tickets=tickets_data,
        total_price=str(reservation.total),
    )


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

                content: EmailContent | None = None
                if (
                    email.event == NotificationEvent.TICKET_ISSUED.value
                    and email.reservation_id is not None
                ):
                    try:
                        content = _build_tickets_email_content(db, email.reservation_id)
                    except Exception:
                        logger.exception(
                            "Error construyendo plantilla de boletos para reserva %s",
                            email.reservation_id,
                        )

                if content is None:
                    content = notification_email(email.title, email.message)

                sent = send_email(account.email, content)
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
