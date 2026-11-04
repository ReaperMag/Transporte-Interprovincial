from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.accounts.models import Account
from app.modules.passengers.models import Passenger
from app.modules.sales.models import Payment, PaymentMethod
from app.modules.trips.models import Trip, TripStatus
from app.modules.trips.service import ECUADOR_TIMEZONE
from test_payments import (  # noqa: F401
    payments,
    reserve_in_office,
    reserve_online,
    upload_receipt,
)
from test_reservations import (  # noqa: F401
    ORIGIN,
    login,
    passenger,
    reservation_payload,
    scenario,
    seat_map,
)


def office_sale(client, data, seats):
    """El oficinista reserva en oficina y cobra en efectivo. Devuelve los boletos."""
    login(client, "oficina@andina.ec")
    response = client.post(
        "/api/v1/reservations/office",
        json=reservation_payload(data, "quito", "loja", seats),
        headers=ORIGIN,
    )
    assert response.status_code == 201, response.text
    reservation_id = response.json()["id"]
    paid = client.post(f"/api/v1/payments/reservations/{reservation_id}/cash", headers=ORIGIN)
    assert paid.status_code == 201, paid.text
    tickets = client.get(f"/api/v1/tickets/reservations/{reservation_id}")
    return reservation_id, tickets.json()


def online_purchase(client, data, seats=((1, None),)):
    """El pasajero compra en línea y el oficinista aprueba el comprobante."""
    login(client, "ana@example.com")
    reservation = reserve_online(client, data, seats=seats)
    payment = upload_receipt(client, reservation["id"]).json()
    login(client, "oficina@andina.ec")
    approved = client.post(f"/api/v1/payments/{payment['id']}/approve", headers=ORIGIN)
    assert approved.status_code == 200, approved.text
    return reservation["id"]


def test_cash_sale_issues_one_ticket_per_seat(payments):
    client, _, data = payments

    _, tickets = office_sale(
        client,
        data,
        [(3, passenger("1700000001", "Juan", "Paz")), (4, passenger("1700000002", "Rosa", "Paz"))],
    )

    assert len(tickets) == 2
    assert {ticket["seatNumber"] for ticket in tickets} == {3, 4}
    assert len({ticket["code"] for ticket in tickets}) == 2
    assert all(ticket["channel"] == "office" for ticket in tickets)
    assert all(ticket["validity"] == "valid" for ticket in tickets)
    assert tickets[0]["originCityName"] == "Quito"
    assert tickets[0]["destinationCityName"] == "Loja"
    assert tickets[0]["cooperativeName"] == "Cooperativa Andina"


def test_approved_online_purchase_issues_tickets_and_notifies(payments):
    client, _, data = payments
    online_purchase(client, data)

    login(client, "ana@example.com")
    tickets = client.get("/api/v1/tickets/me").json()
    assert len(tickets) == 1
    assert tickets[0]["channel"] == "online"
    assert tickets[0]["seatNumber"] == 1
    assert Decimal(tickets[0]["price"]) == Decimal("18.00")

    events = [item["event"] for item in client.get("/api/v1/notifications/me").json()]
    assert "ticket_issued" in events


def test_no_tickets_before_the_payment_is_approved(payments):
    client, _, data = payments
    login(client, "ana@example.com")
    reservation = reserve_online(client, data)
    upload_receipt(client, reservation["id"])

    assert client.get("/api/v1/tickets/me").json() == []
    assert client.get(f"/api/v1/tickets/reservations/{reservation['id']}").json() == []


def test_qr_image_contains_a_png(payments):
    client, _, data = payments
    _, tickets = office_sale(client, data, [(3, passenger())])

    response = client.get(f"/api/v1/tickets/{tickets[0]['id']}/qr")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_tickets_are_private(payments):
    client, _, data = payments
    online_purchase(client, data)
    login(client, "ana@example.com")
    ticket = client.get("/api/v1/tickets/me").json()[0]

    login(client, "luis@example.com")
    assert client.get("/api/v1/tickets/me").json() == []
    assert client.get(f"/api/v1/tickets/{ticket['id']}").status_code == 404
    assert client.get(f"/api/v1/tickets/{ticket['id']}/qr").status_code == 404
    assert (
        client.get(f"/api/v1/tickets/reservations/{ticket['reservationId']}").status_code
        == 404
    )

    login(client, "oficina@costa.ec")
    assert client.get(f"/api/v1/tickets/{ticket['id']}").status_code == 404

    login(client, "oficina@andina.ec")
    assert client.get(f"/api/v1/tickets/{ticket['id']}").status_code == 200


def test_history_includes_tickets_bought_in_the_office_under_my_name(payments):
    client, engine, data = payments

    # Luis tiene cuenta y su perfil de pasajero está vinculado a ella.
    with Session(engine) as db:
        luis = db.scalar(select(Account).where(Account.email == "luis@example.com"))
        db.add(
            Passenger(
                id_number="1744444444",
                first_name="Luis",
                last_name="Mora",
                account_id=luis.id,
            )
        )
        db.commit()

    office_sale(client, data, [(4, passenger("1744444444", "Luis", "Mora"))])

    login(client, "luis@example.com")
    tickets = client.get("/api/v1/tickets/me").json()
    assert [ticket["passengerIdNumber"] for ticket in tickets] == ["1744444444"]


def test_ticket_expires_after_the_trip(payments):
    client, engine, data = payments
    _, tickets = office_sale(client, data, [(3, passenger())])
    ticket_id = tickets[0]["id"]

    with Session(engine) as db:
        trip = db.get(Trip, data["trip_id"])
        trip.status = TripStatus.FINISHED
        db.commit()
    assert client.get(f"/api/v1/tickets/{ticket_id}").json()["validity"] == "expired"

    # También vence cuando ya pasó la duración del viaje, aunque nadie lo cierre.
    with Session(engine) as db:
        trip = db.get(Trip, data["trip_id"])
        trip.status = TripStatus.SCHEDULED
        trip.departure_at = datetime.now(ECUADOR_TIMEZONE) - timedelta(days=1)
        db.commit()
    assert client.get(f"/api/v1/tickets/{ticket_id}").json()["validity"] == "expired"


def test_clerk_changes_the_category_and_charges_the_difference(payments):
    client, engine, data = payments
    senior = passenger("1755555555", "Elena", "Vaca")
    senior["category"] = "senior"
    reservation_id, tickets = office_sale(client, data, [(3, senior)])
    old = tickets[0]
    assert Decimal(old["price"]) == Decimal("8.00")

    response = client.post(
        f"/api/v1/tickets/{old['id']}/change",
        json={"category": "regular"},
        headers=ORIGIN,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert Decimal(body["amountCharged"]) == Decimal("8.00")
    assert body["previousTicket"]["validity"] == "cancelled"
    assert body["newTicket"]["validity"] == "valid"
    assert body["newTicket"]["code"] != old["code"]
    assert body["newTicket"]["passengerCategory"] == "regular"
    assert Decimal(body["newTicket"]["price"]) == Decimal("16.00")

    with Session(engine) as db:
        payments_made = db.scalars(
            select(Payment).where(Payment.reservation_id == reservation_id)
        ).all()
        assert [(p.method, p.amount) for p in payments_made] == [
            (PaymentMethod.CASH, Decimal("8.00")),
            (PaymentMethod.CASH, Decimal("8.00")),
        ]

    # La reserva muestra solo el boleto vigente y el anterior ya no sirve.
    current = client.get(f"/api/v1/tickets/reservations/{reservation_id}").json()
    assert [ticket["id"] for ticket in current] == [body["newTicket"]["id"]]


def test_clerk_moves_the_passenger_to_another_seat(payments):
    client, _, data = payments
    _, tickets = office_sale(client, data, [(3, passenger())])

    response = client.post(
        f"/api/v1/tickets/{tickets[0]['id']}/change",
        json={"category": "regular", "seatId": data["seats"][1]},
        headers=ORIGIN,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["newTicket"]["seatNumber"] == 1
    assert body["newTicket"]["seatType"] == "vip"
    assert Decimal(body["amountCharged"]) == Decimal("2.00")

    seats = seat_map(client, data, "quito", "loja")
    assert seats[1] is False
    assert seats[3] is True


def test_cheaper_change_has_no_refund_and_occupied_seats_are_rejected(payments):
    client, _, data = payments
    _, tickets = office_sale(
        client,
        data,
        [(1, passenger("1700000001", "Juan", "Paz")), (3, passenger("1700000002", "Rosa", "Paz"))],
    )
    vip_ticket = next(ticket for ticket in tickets if ticket["seatNumber"] == 1)

    occupied = client.post(
        f"/api/v1/tickets/{vip_ticket['id']}/change",
        json={"category": "regular", "seatId": data["seats"][3]},
        headers=ORIGIN,
    )
    assert occupied.status_code == 409

    cheaper = client.post(
        f"/api/v1/tickets/{vip_ticket['id']}/change",
        json={"category": "regular", "seatId": data["seats"][4]},
        headers=ORIGIN,
    )
    assert cheaper.status_code == 200, cheaper.text
    assert Decimal(cheaper.json()["amountCharged"]) == Decimal("0.00")


def test_only_office_staff_of_the_cooperative_can_change_tickets(payments):
    client, _, data = payments
    _, tickets = office_sale(client, data, [(3, passenger())])
    url = f"/api/v1/tickets/{tickets[0]['id']}/change"

    login(client, "ana@example.com")
    assert client.post(url, json={"category": "regular"}, headers=ORIGIN).status_code == 403

    login(client, "oficina@costa.ec")
    assert client.post(url, json={"category": "regular"}, headers=ORIGIN).status_code == 404

    login(client, "oficina@andina.ec")
    first = client.post(url, json={"category": "regular"}, headers=ORIGIN)
    assert first.status_code == 200
    again = client.post(url, json={"category": "regular"}, headers=ORIGIN)
    assert again.status_code == 409
