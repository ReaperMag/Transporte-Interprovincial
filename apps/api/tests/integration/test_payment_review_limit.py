from datetime import datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.accounts.models import Account
from app.modules.cooperatives.models import Cooperative
from app.modules.notifications.models import Notification, NotificationEvent
from app.modules.reservations.models import Reservation
from app.modules.sales.models import Payment, PaymentStatus
from app.modules.trips.models import Trip
from app.modules.trips.service import ECUADOR_TIMEZONE
from test_cooperative_profile import create_cooperative_account
from test_cooperative_profile import login as login_cooperative
from test_payments import payments, reserve_online, upload_receipt  # noqa: F401
from test_reservations import ORIGIN, login, scenario, seat_map  # noqa: F401


def now() -> datetime:
    return datetime.now(ECUADOR_TIMEZONE)


def as_local(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=ECUADOR_TIMEZONE)
    return value.astimezone(ECUADOR_TIMEZONE)


def reservation_in_review(client, data) -> dict:
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)
    uploaded = upload_receipt(client, reservation["id"])
    assert uploaded.status_code == 201, uploaded.text
    return uploaded.json()


def set_review_deadline(engine, reservation_id: int, deadline: datetime) -> None:
    with Session(engine) as db:
        db.get(Reservation, reservation_id).review_expires_at = deadline
        db.commit()


def notifications_for(engine, email: str, event: NotificationEvent) -> list[Notification]:
    with Session(engine) as db:
        account_id = db.scalar(select(Account.id).where(Account.email == email))
        return list(
            db.scalars(
                select(Notification).where(
                    Notification.account_id == account_id,
                    Notification.event == event,
                )
            ).all()
        )


# ---------------------------------------------------------------------------
# Configuración de la cooperativa
# ---------------------------------------------------------------------------


def test_cooperative_configures_the_review_time(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(
        engine, name="Cooperativa Revisión", email="revision@example.com"
    )
    assert login_cooperative(client, "revision@example.com").status_code == 200

    profile = client.get("/api/v1/cooperatives/me/profile")
    assert profile.json()["paymentReviewTimeoutMinutes"] == 30

    updated = client.patch(
        "/api/v1/cooperatives/me/profile",
        json={"paymentReviewTimeoutMinutes": 45},
        headers={"Origin": settings.frontend_origin},
    )

    assert updated.status_code == 200, updated.text
    assert updated.json()["paymentReviewTimeoutMinutes"] == 45
    with Session(engine) as db:
        assert db.get(Cooperative, cooperative.id).payment_review_timeout_minutes == 45


@pytest.mark.parametrize("minutes", [5, 121, None])
def test_review_time_must_be_between_ten_minutes_and_two_hours(test_environment, minutes):
    client, engine = test_environment
    create_cooperative_account(
        engine, name="Cooperativa Límite", email="limite@example.com"
    )
    assert login_cooperative(client, "limite@example.com").status_code == 200

    response = client.patch(
        "/api/v1/cooperatives/me/profile",
        json={"paymentReviewTimeoutMinutes": minutes},
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Hora límite de revisión
# ---------------------------------------------------------------------------


def test_uploading_the_receipt_sets_the_review_deadline(payments):
    client, engine, data = payments
    before = now()

    payment = reservation_in_review(client, data)

    with Session(engine) as db:
        stored = db.get(Reservation, payment["reservationId"])
        deadline = as_local(stored.review_expires_at)
    assert before + timedelta(minutes=29) < deadline < now() + timedelta(minutes=31)

    login(client, "oficina@andina.ec")
    pending = client.get("/api/v1/payments/pending").json()
    assert [item["id"] for item in pending] == [payment["id"]]
    assert pending[0]["reviewExpiresAt"] is not None
    assert pending[0]["departsSoon"] is False


def test_review_deadline_uses_the_cooperative_setting(payments):
    client, engine, data = payments
    with Session(engine) as db:
        trip = db.get(Trip, data["trip_id"])
        db.get(Cooperative, trip.cooperative_id).payment_review_timeout_minutes = 60
        db.commit()

    payment = reservation_in_review(client, data)

    with Session(engine) as db:
        deadline = as_local(db.get(Reservation, payment["reservationId"]).review_expires_at)
    assert now() + timedelta(minutes=59) < deadline <= now() + timedelta(minutes=60)


def test_approving_the_payment_clears_the_review_deadline(payments):
    client, engine, data = payments
    payment = reservation_in_review(client, data)

    login(client, "oficina@andina.ec")
    approved = client.post(f"/api/v1/payments/{payment['id']}/approve", headers=ORIGIN)

    assert approved.status_code == 200, approved.text
    assert approved.json()["reviewExpiresAt"] is None
    with Session(engine) as db:
        assert db.get(Reservation, payment["reservationId"]).review_expires_at is None


def test_rejecting_the_receipt_clears_the_review_deadline(payments):
    client, engine, data = payments
    payment = reservation_in_review(client, data)

    login(client, "oficina@andina.ec")
    rejected = client.post(
        f"/api/v1/payments/{payment['id']}/reject",
        json={"reason": "receipt_unverifiable"},
        headers=ORIGIN,
    )

    assert rejected.status_code == 200, rejected.text
    with Session(engine) as db:
        stored = db.get(Reservation, payment["reservationId"])
        assert stored.status == "pending_payment"
        assert stored.review_expires_at is None


# ---------------------------------------------------------------------------
# Revisión vencida
# ---------------------------------------------------------------------------


def test_expired_review_cancels_the_reservation_and_frees_the_seats(payments):
    client, engine, data = payments
    payment = reservation_in_review(client, data)
    set_review_deadline(engine, payment["reservationId"], now() - timedelta(minutes=1))

    login(client, "oficina@andina.ec")
    assert client.get("/api/v1/payments/pending").json() == []

    with Session(engine) as db:
        reservation = db.get(Reservation, payment["reservationId"])
        assert reservation.status == "cancelled"
        assert reservation.review_expires_at is None
        assert db.get(Payment, payment["id"]).status == PaymentStatus.EXPIRED

    login(client, "ana@example.com")
    assert seat_map(client, data, "quito", "loja")[1] is True
    history = client.get(f"/api/v1/payments/reservations/{payment['reservationId']}")
    assert history.json()[0]["status"] == "expired"


def test_passenger_is_told_to_go_to_the_office_when_the_review_expires(payments):
    client, engine, data = payments
    payment = reservation_in_review(client, data)
    set_review_deadline(engine, payment["reservationId"], now() - timedelta(minutes=1))

    login(client, "oficina@andina.ec")
    client.get("/api/v1/payments/pending")

    sent = notifications_for(
        engine, "ana@example.com", NotificationEvent.PAYMENT_REVIEW_EXPIRED
    )
    assert len(sent) == 1
    assert "oficina" in sent[0].message
    assert sent[0].reservation_id == payment["reservationId"]


def test_expired_review_can_no_longer_be_approved(payments):
    client, engine, data = payments
    payment = reservation_in_review(client, data)
    set_review_deadline(engine, payment["reservationId"], now() - timedelta(minutes=1))

    login(client, "oficina@andina.ec")
    client.get("/api/v1/payments/pending")
    approved = client.post(f"/api/v1/payments/{payment['id']}/approve", headers=ORIGIN)

    assert approved.status_code == 409


def test_review_within_the_time_keeps_the_seats(payments):
    client, engine, data = payments
    payment = reservation_in_review(client, data)
    set_review_deadline(engine, payment["reservationId"], now() + timedelta(minutes=1))

    login(client, "oficina@andina.ec")
    assert [item["id"] for item in client.get("/api/v1/payments/pending").json()] == [
        payment["id"]
    ]
    login(client, "ana@example.com")
    assert seat_map(client, data, "quito", "loja")[1] is False


# ---------------------------------------------------------------------------
# Alerta a los oficinistas
# ---------------------------------------------------------------------------


def test_clerks_are_alerted_at_half_of_the_review_time(payments):
    client, engine, data = payments
    payment = reservation_in_review(client, data)
    # Con 30 minutos de revisión, la mitad se cumple cuando faltan 15.
    set_review_deadline(engine, payment["reservationId"], now() + timedelta(minutes=10))

    login(client, "oficina@andina.ec")
    client.get("/api/v1/payments/pending")
    client.get("/api/v1/payments/pending")

    alerts = notifications_for(
        engine, "oficina@andina.ec", NotificationEvent.PAYMENT_REVIEW_DUE
    )
    assert len(alerts) == 1
    assert f"#{payment['reservationId']}" in alerts[0].message
    assert notifications_for(
        engine, "oficina@costa.ec", NotificationEvent.PAYMENT_REVIEW_DUE
    ) == []


def test_clerks_are_not_alerted_before_half_of_the_review_time(payments):
    client, engine, data = payments
    payment = reservation_in_review(client, data)
    set_review_deadline(engine, payment["reservationId"], now() + timedelta(minutes=25))

    login(client, "oficina@andina.ec")
    client.get("/api/v1/payments/pending")

    assert notifications_for(
        engine, "oficina@andina.ec", NotificationEvent.PAYMENT_REVIEW_DUE
    ) == []


# ---------------------------------------------------------------------------
# Viajes que salen pronto
# ---------------------------------------------------------------------------


def test_receipts_of_trips_leaving_within_an_hour_are_marked(payments):
    client, engine, data = payments
    payment = reservation_in_review(client, data)
    with Session(engine) as db:
        db.get(Trip, data["trip_id"]).departure_at = now() + timedelta(minutes=40)
        db.commit()

    login(client, "oficina@andina.ec")
    pending = client.get("/api/v1/payments/pending").json()

    assert [item["id"] for item in pending] == [payment["id"]]
    assert pending[0]["departsSoon"] is True
