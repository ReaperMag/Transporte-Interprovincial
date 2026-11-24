from datetime import datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.notifications.models import Notification, NotificationEvent
from app.modules.reservations.models import Reservation, ReservationSeat
from app.modules.reservations.service import get_occupied_seat_ids
from app.modules.roles_permissions.seed import (
    COOPERATIVE_BUS_STAFF_ROLE,
    ensure_default_roles,
)
from app.modules.sales.models import Payment, PaymentStatus
from app.modules.staff.models import Staff, StaffPosition
from app.modules.tickets.models import Ticket, TicketStatus
from app.modules.trips.models import Trip, TripStatus
from app.modules.trips.service import ECUADOR_TIMEZONE
from test_payments import payments, reserve_online, upload_receipt  # noqa: F401
from test_reservations import (  # noqa: F401
    ORIGIN,
    PASSWORD,
    login,
    passenger,
    reservation_payload,
    scenario,
)


TRIPS_URL = "/api/v1/bus-staff/trips"
PROBLEMS_URL = "/api/v1/cooperatives/me/trip-problems"
DRIVER = "conductor@andina.ec"


def now() -> datetime:
    return datetime.now(ECUADOR_TIMEZONE)


@pytest.fixture
def bus_trip(payments):
    """
    Escenario de reservas con un conductor asignado al bus del viaje.
    El viaje sale en 20 minutos, dentro de la ventana de abordaje.
    """
    client, engine, data = payments
    with Session(engine) as db:
        trip = db.get(Trip, data["trip_id"])
        trip.departure_at = now() + timedelta(minutes=20)
        account = Account(
            email=DRIVER,
            password_hash=hash_password(PASSWORD),
            account_type=AccountType.COOPERATIVE,
            cooperative_id=trip.cooperative_id,
            role_id=ensure_default_roles(db)[COOPERATIVE_BUS_STAFF_ROLE].id,
        )
        db.add(account)
        db.flush()
        db.add(
            Staff(
                cooperative_id=trip.cooperative_id,
                account_id=account.id,
                first_name="Carlos",
                last_name="Conductor",
                id_number="1700000019",
                position=StaffPosition.BUS_STAFF,
                assigned_bus_id=trip.bus_id,
            )
        )
        db.commit()
    return client, engine, data


def sell_in_office(client, data, seat: int, person: dict) -> dict:
    """Venta en oficina pagada en efectivo: deja el boleto emitido."""
    login(client, "oficina@andina.ec")
    reservation = client.post(
        "/api/v1/reservations/office",
        json=reservation_payload(data, "quito", "loja", [(seat, person)]),
        headers=ORIGIN,
    )
    assert reservation.status_code == 201, reservation.text
    paid = client.post(
        f"/api/v1/payments/reservations/{reservation.json()['id']}/cash",
        headers=ORIGIN,
    )
    assert paid.status_code == 201, paid.text
    return reservation.json()


def ticket_of(engine, reservation_id: int) -> Ticket:
    with Session(engine) as db:
        return db.scalar(
            select(Ticket)
            .join(ReservationSeat, Ticket.reservation_seat_id == ReservationSeat.id)
            .where(
                ReservationSeat.reservation_id == reservation_id,
                Ticket.status != TicketStatus.CANCELLED,
            )
        )


def regular_ticket(client, engine, data) -> Ticket:
    reservation = sell_in_office(client, data, 3, passenger("1756990063", "Juan", "Paz"))
    return ticket_of(engine, reservation["id"])


def senior_ticket(client, engine, data) -> Ticket:
    person = {**passenger("1711111110", "Rosa", "Mora"), "category": "senior"}
    reservation = sell_in_office(client, data, 4, person)
    return ticket_of(engine, reservation["id"])


def start_boarding(client, data):
    login(client, DRIVER)
    response = client.post(f"{TRIPS_URL}/{data['trip_id']}/boarding", headers=ORIGIN)
    assert response.status_code == 200, response.text
    return response.json()


def validate(client, data, code: str):
    return client.post(
        f"{TRIPS_URL}/{data['trip_id']}/tickets/validate",
        json={"code": code},
        headers=ORIGIN,
    )


def notifications(engine, email: str, event: NotificationEvent) -> list[Notification]:
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
# Viajes del bus asignado
# ---------------------------------------------------------------------------


def test_bus_staff_sees_the_trips_of_its_assigned_bus(bus_trip):
    client, engine, data = bus_trip
    regular_ticket(client, engine, data)

    login(client, DRIVER)
    trips = client.get(TRIPS_URL)

    assert trips.status_code == 200, trips.text
    assert [trip["id"] for trip in trips.json()] == [data["trip_id"]]
    assert trips.json()[0]["status"] == "scheduled"
    assert trips.json()[0]["ticketsSold"] == 1
    detail = client.get(f"{TRIPS_URL}/{data['trip_id']}").json()
    assert detail["originCityName"] == "Quito"
    assert [item["seatNumber"] for item in detail["passengers"]] == [3]
    assert detail["passengers"][0]["status"] == "issued"


def test_bus_staff_cannot_see_trips_of_another_bus(bus_trip):
    client, engine, data = bus_trip
    with Session(engine) as db:
        db.query(Staff).filter_by(id_number="1700000019").one().assigned_bus_id = None
        db.commit()

    login(client, DRIVER)

    assert client.get(TRIPS_URL).status_code == 409
    assert client.get(f"{TRIPS_URL}/{data['trip_id']}").status_code == 409


@pytest.mark.parametrize("email", ["oficina@andina.ec", "ana@example.com"])
def test_only_bus_staff_controls_trips(bus_trip, email):
    client, _, data = bus_trip
    login(client, email)

    assert client.get(TRIPS_URL).status_code == 403
    assert client.post(
        f"{TRIPS_URL}/{data['trip_id']}/boarding", headers=ORIGIN
    ).status_code == 403


# ---------------------------------------------------------------------------
# Abordaje
# ---------------------------------------------------------------------------


def test_boarding_starts_within_thirty_minutes_of_departure(bus_trip):
    client, engine, data = bus_trip
    with Session(engine) as db:
        db.get(Trip, data["trip_id"]).departure_at = now() + timedelta(minutes=45)
        db.commit()

    login(client, DRIVER)
    too_early = client.post(f"{TRIPS_URL}/{data['trip_id']}/boarding", headers=ORIGIN)
    assert too_early.status_code == 409
    assert "30 minutos" in too_early.json()["detail"]

    with Session(engine) as db:
        db.get(Trip, data["trip_id"]).departure_at = now() + timedelta(minutes=25)
        db.commit()
    body = start_boarding(client, data)

    assert body["status"] == "boarding"
    assert body["boardingStartedAt"] is not None
    with Session(engine) as db:
        trip = db.get(Trip, data["trip_id"])
        assert trip.boarding_started_by_id is not None


def test_boarding_closes_the_sale_of_the_trip(bus_trip):
    client, _, data = bus_trip
    start_boarding(client, data)

    login(client, "ana@example.com")
    online = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "quito", "loja", [(1, passenger())]),
        headers=ORIGIN,
    )
    login(client, "oficina@andina.ec")
    office = client.post(
        "/api/v1/reservations/office",
        json=reservation_payload(data, "quito", "loja", [(2, passenger("1756990063"))]),
        headers=ORIGIN,
    )

    assert online.status_code == 404
    assert office.status_code == 404


def test_boarding_cancels_unpaid_and_in_review_reservations(bus_trip):
    client, engine, data = bus_trip
    login(client, "ana@example.com")
    unpaid = reserve_online(client, data, seats=((1, None),))
    in_review = reserve_online(
        client, data, seats=((2, passenger("1722222229", "Luis", "Vera")),)
    )
    assert upload_receipt(client, in_review["id"]).status_code == 201

    start_boarding(client, data)

    with Session(engine) as db:
        assert db.get(Reservation, unpaid["id"]).status == "cancelled"
        assert db.get(Reservation, in_review["id"]).status == "cancelled"
        payment = db.scalar(select(Payment).where(Payment.reservation_id == in_review["id"]))
        assert payment.status == PaymentStatus.EXPIRED
    sent = notifications(engine, "ana@example.com", NotificationEvent.RESERVATION_CANCELLED)
    messages = {item.reservation_id: item.message for item in sent}
    assert "no estaba pagada" in messages[unpaid["id"]]
    assert "oficina" in messages[in_review["id"]]


def test_bus_can_have_only_one_active_trip(bus_trip):
    client, engine, data = bus_trip
    with Session(engine) as db:
        first = db.get(Trip, data["trip_id"])
        second = Trip(
            cooperative_id=first.cooperative_id,
            frequency_id=first.frequency_id,
            bus_id=first.bus_id,
            template_id=first.template_id,
            departure_at=now() + timedelta(minutes=25),
        )
        db.add(second)
        db.commit()
        second_id = second.id

    start_boarding(client, data)
    response = client.post(f"{TRIPS_URL}/{second_id}/boarding", headers=ORIGIN)

    assert response.status_code == 409
    assert "otro viaje" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Validación de boletos
# ---------------------------------------------------------------------------


def test_regular_ticket_boards_once(bus_trip):
    client, engine, data = bus_trip
    ticket = regular_ticket(client, engine, data)
    start_boarding(client, data)

    first = validate(client, data, f"  {ticket.code} ")
    second = validate(client, data, ticket.code)

    assert first.status_code == 200, first.text
    assert first.json()["result"] == "boarded"
    assert first.json()["passenger"]["status"] == "used"
    assert first.json()["passenger"]["seatNumber"] == 3
    assert second.status_code == 409
    assert "ya se usó" in second.json()["detail"]
    with Session(engine) as db:
        assert db.get(Ticket, ticket.id).validated_by_id is not None


def test_tickets_are_validated_only_during_boarding(bus_trip):
    client, engine, data = bus_trip
    ticket = regular_ticket(client, engine, data)

    login(client, DRIVER)
    response = validate(client, data, ticket.code)

    assert response.status_code == 409


def test_unknown_or_foreign_ticket_is_rejected(bus_trip):
    client, engine, data = bus_trip
    ticket = regular_ticket(client, engine, data)
    with Session(engine) as db:
        original = db.get(Trip, data["trip_id"])
        other_trip = Trip(
            cooperative_id=original.cooperative_id,
            frequency_id=original.frequency_id,
            bus_id=original.bus_id,
            departure_at=now() + timedelta(days=2),
        )
        db.add(other_trip)
        db.flush()
        db.get(Ticket, ticket.id).trip_id = other_trip.id
        db.commit()
    start_boarding(client, data)

    assert validate(client, data, "codigo-inexistente").status_code == 404
    foreign = validate(client, data, ticket.code)
    assert foreign.status_code == 409
    assert foreign.json()["detail"] == "El boleto es de otro viaje."


def test_discount_ticket_needs_the_category_check(bus_trip):
    client, engine, data = bus_trip
    ticket = senior_ticket(client, engine, data)
    start_boarding(client, data)

    checked = validate(client, data, ticket.code)
    assert checked.status_code == 200, checked.text
    assert checked.json()["result"] == "needs_category_check"
    assert checked.json()["passenger"]["status"] == "issued"

    confirmed = client.post(
        f"{TRIPS_URL}/{data['trip_id']}/tickets/{ticket.id}/confirm-category",
        headers=ORIGIN,
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "used"


def test_wrong_category_rejects_the_ticket(bus_trip):
    client, engine, data = bus_trip
    login(client, "ana@example.com")
    person = {**passenger("1711111110", "Ana", "Perez"), "category": "senior"}
    reservation = reserve_online(client, data, seats=((4, person),))
    assert upload_receipt(
        client, reservation["id"], documents=((data["seats"][4], b"\x89PNG\r\n\x1a\n"),)
    ).status_code == 201
    login(client, "oficina@andina.ec")
    pending = client.get("/api/v1/payments/pending").json()
    assert client.post(
        f"/api/v1/payments/{pending[0]['id']}/approve", headers=ORIGIN
    ).status_code == 200
    ticket = ticket_of(engine, reservation["id"])
    start_boarding(client, data)

    rejected = client.post(
        f"{TRIPS_URL}/{data['trip_id']}/tickets/{ticket.id}/reject-category",
        headers=ORIGIN,
    )

    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"
    assert "tercera edad" in rejected.json()["rejectionReason"]
    again = validate(client, data, ticket.code)
    assert again.status_code == 409
    assert "oficina" in again.json()["detail"]
    sent = notifications(engine, "ana@example.com", NotificationEvent.TICKET_REJECTED)
    assert len(sent) == 1
    assert "oficina" in sent[0].message


def test_rejected_ticket_can_be_changed_at_the_office(bus_trip):
    client, engine, data = bus_trip
    ticket = senior_ticket(client, engine, data)
    start_boarding(client, data)
    client.post(
        f"{TRIPS_URL}/{data['trip_id']}/tickets/{ticket.id}/reject-category",
        headers=ORIGIN,
    )

    login(client, "oficina@andina.ec")
    changed = client.post(
        f"/api/v1/tickets/{ticket.id}/change",
        json={"category": "regular"},
        headers=ORIGIN,
    )

    assert changed.status_code == 200, changed.text
    new_code = changed.json()["newTicket"]["code"]
    login(client, DRIVER)
    boarded = validate(client, data, new_code)
    assert boarded.json()["result"] == "boarded"


def test_regular_ticket_cannot_go_through_the_category_check(bus_trip):
    client, engine, data = bus_trip
    ticket = regular_ticket(client, engine, data)
    start_boarding(client, data)

    response = client.post(
        f"{TRIPS_URL}/{data['trip_id']}/tickets/{ticket.id}/reject-category",
        headers=ORIGIN,
    )

    assert response.status_code == 409


# ---------------------------------------------------------------------------
# Inicio y fin del viaje
# ---------------------------------------------------------------------------


def test_starting_the_trip_frees_the_seats_of_passengers_who_did_not_board(bus_trip):
    client, engine, data = bus_trip
    boarded = regular_ticket(client, engine, data)
    absent = senior_ticket(client, engine, data)
    start_boarding(client, data)
    validate(client, data, boarded.code)

    started = client.post(f"{TRIPS_URL}/{data['trip_id']}/start", headers=ORIGIN)

    assert started.status_code == 200, started.text
    assert started.json()["status"] == "in_progress"
    assert started.json()["passengersBoarded"] == 1
    statuses = {item["seatNumber"]: item["status"] for item in started.json()["passengers"]}
    assert statuses == {3: "used", 4: "no_show"}
    with Session(engine) as db:
        trip = db.get(Trip, data["trip_id"])
        segment = (0, 3)
        assert get_occupied_seat_ids(db, trip, segment) == {data["seats"][3]}
        assert db.get(Ticket, absent.id).status == TicketStatus.NO_SHOW


def test_trip_must_be_boarding_to_start(bus_trip):
    client, _, data = bus_trip
    login(client, DRIVER)

    response = client.post(f"{TRIPS_URL}/{data['trip_id']}/start", headers=ORIGIN)

    assert response.status_code == 409


def test_finishing_the_trip_records_the_arrival(bus_trip):
    client, engine, data = bus_trip
    start_boarding(client, data)
    assert client.post(
        f"{TRIPS_URL}/{data['trip_id']}/finish", headers=ORIGIN
    ).status_code == 409
    client.post(f"{TRIPS_URL}/{data['trip_id']}/start", headers=ORIGIN)

    finished = client.post(f"{TRIPS_URL}/{data['trip_id']}/finish", headers=ORIGIN)

    assert finished.status_code == 200, finished.text
    assert finished.json()["status"] == "finished"
    assert finished.json()["finishedAt"] is not None
    with Session(engine) as db:
        assert db.get(Trip, data["trip_id"]).status == TripStatus.FINISHED
    assert client.get(TRIPS_URL).json() == []


# ---------------------------------------------------------------------------
# Problemas reportados
# ---------------------------------------------------------------------------


def test_reported_problem_alerts_the_clerks(bus_trip):
    client, engine, data = bus_trip
    start_boarding(client, data)

    response = client.post(
        f"{TRIPS_URL}/{data['trip_id']}/problems",
        json={"problemType": "mechanical", "comment": "Se pinchó una llanta."},
        headers=ORIGIN,
    )

    assert response.status_code == 201, response.text
    assert response.json()["reportedByName"] == "Carlos Conductor"
    alerts = notifications(engine, "oficina@andina.ec", NotificationEvent.TRIP_PROBLEM_REPORTED)
    assert len(alerts) == 1
    assert "Falla mecánica" in alerts[0].message
    assert "Se pinchó una llanta." in alerts[0].message
    assert notifications(
        engine, "oficina@costa.ec", NotificationEvent.TRIP_PROBLEM_REPORTED
    ) == []
    detail = client.get(f"{TRIPS_URL}/{data['trip_id']}").json()
    assert [problem["comment"] for problem in detail["problems"]] == ["Se pinchó una llanta."]


@pytest.mark.parametrize("payload", [{}, {"comment": ""}, {"comment": "x", "problemType": "x"}])
def test_problem_requires_a_comment(bus_trip, payload):
    client, _, data = bus_trip
    login(client, DRIVER)

    response = client.post(
        f"{TRIPS_URL}/{data['trip_id']}/problems", json=payload, headers=ORIGIN
    )

    assert response.status_code == 422


def test_clerk_resolves_a_reported_problem(bus_trip):
    client, _, data = bus_trip
    login(client, DRIVER)
    problem = client.post(
        f"{TRIPS_URL}/{data['trip_id']}/problems",
        json={"comment": "Retraso por neblina en la vía."},
        headers=ORIGIN,
    ).json()

    login(client, "oficina@andina.ec")
    assert [item["id"] for item in client.get(PROBLEMS_URL).json()] == [problem["id"]]
    resolved = client.post(f"{PROBLEMS_URL}/{problem['id']}/resolve", headers=ORIGIN)

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["resolvedByName"] == "Olga Oficinista"
    assert client.get(PROBLEMS_URL).json() == []
    assert len(client.get(f"{PROBLEMS_URL}?onlyOpen=false").json()) == 1
    assert client.post(
        f"{PROBLEMS_URL}/{problem['id']}/resolve", headers=ORIGIN
    ).status_code == 409


def test_other_cooperative_cannot_see_the_problems(bus_trip):
    client, _, data = bus_trip
    login(client, DRIVER)
    problem = client.post(
        f"{TRIPS_URL}/{data['trip_id']}/problems",
        json={"comment": "Retraso en el terminal."},
        headers=ORIGIN,
    ).json()

    login(client, "oficina@costa.ec")

    assert client.get(PROBLEMS_URL).json() == []
    assert client.post(
        f"{PROBLEMS_URL}/{problem['id']}/resolve", headers=ORIGIN
    ).status_code == 404
