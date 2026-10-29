from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.notifications.models import Notification
from app.modules.passengers.models import Passenger, PassengerCategory
from app.modules.reservations.models import Reservation
from app.modules.trips.service import ECUADOR_TIMEZONE
from test_reservations import (  # noqa: F401
    ORIGIN,
    login,
    passenger,
    reservation_payload,
    scenario,
    seat_map,
)


PDF = b"%PDF-1.4 comprobante de prueba"
PNG = b"\x89PNG\r\n\x1a\n imagen de prueba"


@pytest.fixture
def payments(scenario, tmp_path, monkeypatch):
    """Escenario de reservas con los archivos subidos en una carpeta temporal."""
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    return scenario


def reserve_online(client, data, seats=((1, None),), origin="quito", destination="loja"):
    people = []
    for number, person in seats:
        people.append((number, person or passenger()))
    response = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, origin, destination, people),
        headers=ORIGIN,
    )
    assert response.status_code == 201, response.text
    return response.json()


def reserve_in_office(client, data, seat=3):
    response = client.post(
        "/api/v1/reservations/office",
        json=reservation_payload(
            data, "quito", "loja", [(seat, passenger("1799999990", "Juan", "Paz"))]
        ),
        headers=ORIGIN,
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload_receipt(client, reservation_id, *, receipt=PDF, documents=(), method="transfer"):
    files = [("receipt", ("comprobante.pdf", receipt, "application/pdf"))]
    data = {"method": method, "receiptReference": "TRX-001"}
    seat_ids = []
    for seat_id, content in documents:
        files.append(("documents", ("cedula.png", content, "image/png")))
        seat_ids.append(str(seat_id))
    if seat_ids:
        data["documentSeatIds"] = seat_ids
    return client.post(
        f"/api/v1/payments/reservations/{reservation_id}/receipt",
        data=data,
        files=files,
        headers=ORIGIN,
    )


def test_payment_methods_show_demo_bank_data(payments):
    client, _, _ = payments
    login(client, "ana@example.com")

    response = client.get("/api/v1/payments/methods")

    assert response.status_code == 200
    body = response.json()
    assert body["bankName"] == "Banco Pichincha"
    assert body["isDemo"] is True
    assert body["deunaQr"]


def test_clerk_charges_cash_for_an_office_reservation(payments):
    client, _, data = payments
    login(client, "oficina@andina.ec")
    reservation = reserve_in_office(client, data)

    response = client.post(
        f"/api/v1/payments/reservations/{reservation['id']}/cash",
        headers=ORIGIN,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["method"] == "cash"
    assert body["status"] == "approved"
    assert Decimal(body["amount"]) == Decimal("16.00")
    assert body["reservationStatus"] == "confirmed"

    again = client.post(
        f"/api/v1/payments/reservations/{reservation['id']}/cash",
        headers=ORIGIN,
    )
    assert again.status_code == 409


def test_cash_is_only_for_office_reservations(payments):
    client, _, data = payments
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)

    login(client, "oficina@andina.ec")
    response = client.post(
        f"/api/v1/payments/reservations/{reservation['id']}/cash",
        headers=ORIGIN,
    )
    assert response.status_code == 403


def test_receipt_puts_the_reservation_in_review(payments):
    client, engine, data = payments
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)

    response = upload_receipt(client, reservation["id"])

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "pending"
    assert body["reservationStatus"] == "payment_review"
    assert body["hasReceipt"] is True

    # En revisión, la reserva no vence aunque pase el tiempo límite.
    with Session(engine) as db:
        stored = db.get(Reservation, reservation["id"])
        stored.expires_at = datetime.now(ECUADOR_TIMEZONE) - timedelta(minutes=1)
        db.commit()
    assert seat_map(client, data, "quito", "loja")[1] is False

    receipt = client.get(f"/api/v1/payments/{body['id']}/receipt")
    assert receipt.status_code == 200
    assert receipt.content == PDF


def test_rejects_files_that_are_not_pdf_or_images(payments):
    client, _, data = payments
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)

    response = upload_receipt(client, reservation["id"], receipt=b"MZ ejecutable")
    assert response.status_code == 422

    monkey_big = PDF + b"0" * (settings.max_upload_size_mb * 1024 * 1024)
    too_big = upload_receipt(client, reservation["id"], receipt=monkey_big)
    assert too_big.status_code == 422


def test_cannot_upload_after_the_time_limit(payments):
    client, engine, data = payments
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)

    with Session(engine) as db:
        stored = db.get(Reservation, reservation["id"])
        stored.expires_at = datetime.now(ECUADOR_TIMEZONE) - timedelta(minutes=1)
        db.commit()

    response = upload_receipt(client, reservation["id"])
    assert response.status_code == 409


def test_discount_seats_require_the_passenger_document(payments):
    client, engine, data = payments
    with Session(engine) as db:
        db.add(
            Passenger(
                id_number="1755555555",
                first_name="Elena",
                last_name="Vaca",
                category=PassengerCategory.SENIOR,
            )
        )
        db.commit()

    senior = passenger("1755555555", "Elena", "Vaca")
    senior["category"] = "senior"

    login(client, "ana@example.com")
    reservation = reserve_online(client, data, seats=((3, senior),))

    without_document = upload_receipt(client, reservation["id"])
    assert without_document.status_code == 422

    seat_id = data["seats"][3]
    response = upload_receipt(client, reservation["id"], documents=[(seat_id, PNG)])
    assert response.status_code == 201, response.text
    documents = response.json()["documents"]
    assert [document["seatId"] for document in documents] == [seat_id]

    document = client.get(f"/api/v1/payments/documents/{documents[0]['id']}")
    assert document.status_code == 200
    assert document.content == PNG


def test_clerk_approves_and_the_passenger_is_notified(payments):
    client, _, data = payments
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)
    payment = upload_receipt(client, reservation["id"]).json()

    login(client, "oficina@andina.ec")
    pending = client.get("/api/v1/payments/pending")
    assert [item["id"] for item in pending.json()] == [payment["id"]]

    approved = client.post(f"/api/v1/payments/{payment['id']}/approve", headers=ORIGIN)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["reservationStatus"] == "confirmed"
    assert client.get("/api/v1/payments/pending").json() == []

    login(client, "ana@example.com")
    events = [item["event"] for item in client.get("/api/v1/notifications/me").json()]
    assert events == ["payment_approved", "receipt_uploaded"]


def test_payment_not_received_cancels_and_releases_seats(payments):
    client, _, data = payments
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)
    payment = upload_receipt(client, reservation["id"]).json()

    login(client, "oficina@andina.ec")
    rejected = client.post(
        f"/api/v1/payments/{payment['id']}/reject",
        json={"reason": "payment_not_received", "comment": "No llegó a la cuenta."},
        headers=ORIGIN,
    )

    assert rejected.status_code == 200, rejected.text
    body = rejected.json()
    assert body["status"] == "rejected"
    assert body["reservationStatus"] == "cancelled"
    assert "vuelve a hacer la reserva" in body["rejectionReason"]
    assert "No llegó a la cuenta." in body["rejectionReason"]

    login(client, "ana@example.com")
    assert seat_map(client, data, "quito", "loja")[1] is True


def test_unverifiable_receipt_gives_one_more_chance(payments):
    client, _, data = payments
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)
    first = upload_receipt(client, reservation["id"]).json()

    login(client, "oficina@andina.ec")
    rejected = client.post(
        f"/api/v1/payments/{first['id']}/reject",
        json={"reason": "receipt_unverifiable"},
        headers=ORIGIN,
    )
    assert rejected.json()["reservationStatus"] == "pending_payment"
    assert "Vuelve a subir el comprobante" in rejected.json()["rejectionReason"]

    # El pasajero tiene un nuevo tiempo límite para subir otro comprobante.
    login(client, "ana@example.com")
    detail = client.get(f"/api/v1/reservations/{reservation['id']}").json()
    expires_at = datetime.fromisoformat(detail["expiresAt"]).replace(tzinfo=ECUADOR_TIMEZONE)
    assert expires_at > datetime.now(ECUADOR_TIMEZONE)
    second = upload_receipt(client, reservation["id"])
    assert second.status_code == 201

    # Si el segundo comprobante tampoco se puede verificar, se cancela.
    login(client, "oficina@andina.ec")
    final = client.post(
        f"/api/v1/payments/{second.json()['id']}/reject",
        json={"reason": "receipt_unverifiable"},
        headers=ORIGIN,
    )
    assert final.json()["reservationStatus"] == "cancelled"

    login(client, "ana@example.com")
    history = client.get(f"/api/v1/payments/reservations/{reservation['id']}").json()
    assert [item["status"] for item in history] == ["rejected", "rejected"]


def test_payments_are_private(payments):
    client, engine, data = payments
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)
    payment = upload_receipt(client, reservation["id"]).json()

    login(client, "luis@example.com")
    assert upload_receipt(client, reservation["id"]).status_code == 404
    assert client.get(f"/api/v1/payments/{payment['id']}/receipt").status_code == 404
    assert (
        client.get(f"/api/v1/payments/reservations/{reservation['id']}").status_code
        == 404
    )

    login(client, "oficina@costa.ec")
    assert client.get("/api/v1/payments/pending").json() == []
    assert (
        client.post(f"/api/v1/payments/{payment['id']}/approve", headers=ORIGIN).status_code
        == 404
    )
    assert client.get(f"/api/v1/payments/{payment['id']}/receipt").status_code == 404

    login(client, "ana@example.com")
    assert (
        client.post(f"/api/v1/payments/{payment['id']}/approve", headers=ORIGIN).status_code
        == 403
    )

    with Session(engine) as db:
        assert db.scalars(select(Notification)).all()


def test_notifications_can_be_marked_as_read(payments):
    client, _, data = payments
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)
    upload_receipt(client, reservation["id"])

    notification = client.get("/api/v1/notifications/me").json()[0]
    assert notification["readAt"] is None

    read = client.post(
        f"/api/v1/notifications/{notification['id']}/read", headers=ORIGIN
    )
    assert read.status_code == 200
    assert read.json()["readAt"] is not None

    login(client, "luis@example.com")
    assert (
        client.post(
            f"/api/v1/notifications/{notification['id']}/read", headers=ORIGIN
        ).status_code
        == 404
    )
