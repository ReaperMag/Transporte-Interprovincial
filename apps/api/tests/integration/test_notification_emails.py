from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.accounts.repository import get_account_by_email
from app.modules.notifications.models import Notification, NotificationEvent
from app.modules.notifications.service import notify
from app.modules.reservations.models import Reservation
from app.modules.trips.service import ECUADOR_TIMEZONE
from test_payments import (  # noqa: F401
    payments,
    reserve_in_office,
    reserve_online,
    upload_receipt,
)
from test_reservations import ORIGIN, login, scenario  # noqa: F401


PASSENGER_EMAIL = "ana@example.com"


def notifications_by_event(engine) -> dict[NotificationEvent, Notification]:
    with Session(engine) as db:
        return {item.event: item for item in db.scalars(select(Notification)).all()}


def subjects(fake_smtp, email=PASSENGER_EMAIL) -> list[str]:
    return [message["Subject"] for message in fake_smtp.sent_to(email)]


def approve_online_purchase(client, data):
    login(client, PASSENGER_EMAIL)
    reservation = reserve_online(client, data)
    payment = upload_receipt(client, reservation["id"]).json()
    login(client, "oficina@andina.ec")
    approved = client.post(f"/api/v1/payments/{payment['id']}/approve", headers=ORIGIN)
    return reservation, approved


def test_approved_payment_sends_an_email_and_fills_email_sent_at(payments, fake_smtp):
    client, engine, data = payments

    _, approved = approve_online_purchase(client, data)

    assert approved.status_code == 200
    assert subjects(fake_smtp) == [
        "Reserva creada - Transporte Interprovincial",
        "Comprobante recibido - Transporte Interprovincial",
        "Pago aprobado - Transporte Interprovincial",
        "Boletos emitidos - Transporte Interprovincial",
    ]
    approved_email = fake_smtp.sent_to(PASSENGER_EMAIL)[2]
    assert "Tu pago fue aprobado y tu compra está confirmada." in fake_smtp.text(approved_email)

    sent = notifications_by_event(engine)
    assert sent[NotificationEvent.PAYMENT_APPROVED].email_sent_at is not None
    assert sent[NotificationEvent.TICKET_ISSUED].email_sent_at is not None


def test_payment_approval_completes_even_if_smtp_fails(payments, fake_smtp):
    client, engine, data = payments
    fake_smtp.fail = True

    reservation, approved = approve_online_purchase(client, data)

    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["reservationStatus"] == "confirmed"
    assert fake_smtp.outbox == []
    tickets = client.get(f"/api/v1/tickets/reservations/{reservation['id']}")
    assert tickets.status_code == 200
    assert len(tickets.json()) == 1
    with Session(engine) as db:
        assert db.get(Reservation, reservation["id"]).status == "confirmed"
        notifications = db.scalars(select(Notification)).all()
        assert notifications
        assert all(item.email_sent_at is None for item in notifications)


def test_office_sale_without_account_sends_nothing(payments, fake_smtp):
    client, engine, data = payments
    login(client, "oficina@andina.ec")
    reservation = reserve_in_office(client, data)

    charged = client.post(
        f"/api/v1/payments/reservations/{reservation['id']}/cash",
        headers=ORIGIN,
    )

    assert charged.status_code == 201
    assert fake_smtp.outbox == []
    assert notifications_by_event(engine) == {}


def test_reservation_created_and_cancelled_are_emailed(payments, fake_smtp):
    client, engine, data = payments
    login(client, PASSENGER_EMAIL)
    reservation = reserve_online(client, data)

    cancelled = client.post(f"/api/v1/reservations/{reservation['id']}/cancel", headers=ORIGIN)

    assert cancelled.status_code == 200
    assert subjects(fake_smtp) == [
        "Reserva creada - Transporte Interprovincial",
        "Reserva cancelada - Transporte Interprovincial",
    ]
    created_text = fake_smtp.text(fake_smtp.sent_to(PASSENGER_EMAIL)[0])
    assert "Completa el pago antes del" in created_text
    sent = notifications_by_event(engine)
    assert sent[NotificationEvent.RESERVATION_CANCELLED].email_sent_at is not None


def test_expired_reservation_is_emailed(payments, fake_smtp):
    client, engine, data = payments
    login(client, PASSENGER_EMAIL)
    reservation = reserve_online(client, data)
    with Session(engine) as db:
        db.get(Reservation, reservation["id"]).expires_at = datetime.now(
            ECUADOR_TIMEZONE
        ) - timedelta(minutes=1)
        db.commit()

    detail = client.get(f"/api/v1/reservations/{reservation['id']}")

    assert detail.json()["status"] == "expired"
    assert subjects(fake_smtp)[-1] == "Reserva vencida - Transporte Interprovincial"
    sent = notifications_by_event(engine)
    assert sent[NotificationEvent.RESERVATION_EXPIRED].email_sent_at is not None


def test_no_email_is_sent_if_the_transaction_is_rolled_back(payments, fake_smtp):
    _, engine, _ = payments

    with Session(engine) as db:
        account = get_account_by_email(db, PASSENGER_EMAIL)
        notify(
            db,
            account_id=account.id,
            event=NotificationEvent.PAYMENT_APPROVED,
            title="Pago aprobado",
            message="Este aviso no debe enviarse.",
        )
        db.flush()
        db.rollback()

    assert fake_smtp.outbox == []
    assert notifications_by_event(engine) == {}


def test_development_mode_logs_the_email_and_leaves_email_sent_at_empty(payments, caplog):
    client, engine, data = payments
    caplog.set_level("INFO")

    _, approved = approve_online_purchase(client, data)

    assert approved.status_code == 200
    assert "EMAIL_ENABLED=false" in caplog.text
    assert "Tu pago fue aprobado y tu compra está confirmada." in caplog.text
    sent = notifications_by_event(engine)
    assert sent[NotificationEvent.PAYMENT_APPROVED].email_sent_at is None
