"""
Vinculación de los viajes comprados en oficina cuando el pasajero se
registra después con la misma cédula.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.accounts.models import Account, AccountType
from app.modules.accounts.repository import get_account_by_email
from app.modules.notifications.models import Notification
from app.modules.passengers.linking import GENERIC_MISMATCH_MESSAGE, normalize_name
from app.modules.passengers.models import Passenger
from test_payments import payments  # noqa: F401
from test_reservations import (  # noqa: F401
    ORIGIN,
    PASSWORD,
    login,
    passenger,
    reservation_payload,
    scenario,
)


CEDULA = "1756990063"
CLIENT_EMAIL = "juan.paz@example.com"


def sell_in_office(client, data, people, *, charge=True):
    """El oficinista vende (y cobra en efectivo) asientos para las personas dadas."""
    login(client, "oficina@andina.ec")
    response = client.post(
        "/api/v1/reservations/office",
        json=reservation_payload(data, "quito", "loja", people),
        headers=ORIGIN,
    )
    assert response.status_code == 201, response.text
    reservation = response.json()
    if charge:
        charged = client.post(
            f"/api/v1/payments/reservations/{reservation['id']}/cash",
            headers=ORIGIN,
        )
        assert charged.status_code == 201, charged.text
    return reservation


def signup(client, *, first_name="Juan", last_name="Paz", id_number=CEDULA, email=CLIENT_EMAIL):
    client.cookies.clear()
    return client.post(
        "/api/v1/auth/signup",
        json={
            "firstName": first_name,
            "lastName": last_name,
            "idNumber": id_number,
            "email": email,
            "password": PASSWORD,
            "confirmPassword": PASSWORD,
        },
    )


def verify(client, fake_smtp, email=CLIENT_EMAIL):
    return client.post(
        "/api/v1/auth/verify-email",
        json={"email": email, "code": fake_smtp.last_code(email)},
        headers=ORIGIN,
    )


def passengers_with_id(engine, id_number=CEDULA) -> list[Passenger]:
    with Session(engine) as db:
        return list(db.scalars(select(Passenger).where(Passenger.id_number == id_number)))


def test_office_trip_appears_after_signup_and_verification(payments, fake_smtp):
    client, engine, data = payments
    reservation = sell_in_office(client, data, [(3, passenger(CEDULA, "Juan", "Paz"))])

    # Mayúsculas, tildes y espacios distintos a los de la venta.
    created = signup(client, first_name="  JUAN ", last_name="Páz")
    assert created.status_code == 201, created.text
    verified = verify(client, fake_smtp)
    assert verified.status_code == 200, verified.text
    login(client, CLIENT_EMAIL)

    tickets = client.get("/api/v1/tickets/me").json()
    assert [ticket["reservationId"] for ticket in tickets] == [reservation["id"]]
    assert tickets[0]["channel"] == "office"

    reservations = client.get("/api/v1/reservations/me").json()
    assert [item["id"] for item in reservations] == [reservation["id"]]
    assert reservations[0]["channel"] == "office"
    assert [seat["passengerIdNumber"] for seat in reservations[0]["seats"]] == [CEDULA]

    # Se reutilizó el registro de la venta: sin duplicados y con sus datos.
    [stored] = passengers_with_id(engine)
    assert (stored.first_name, stored.last_name) == ("Juan", "Paz")
    assert stored.email == CLIENT_EMAIL
    with Session(engine) as db:
        account = get_account_by_email(db, CLIENT_EMAIL)
        assert stored.account_id == account.id
        assert account.pending_passenger_id is None

    profile = client.get("/api/v1/passengers/me")
    assert profile.status_code == 200
    assert profile.json()["idNumber"] == CEDULA


def test_linking_notifies_the_trips_found(payments, fake_smtp):
    client, engine, data = payments
    sell_in_office(client, data, [(3, passenger(CEDULA, "Juan", "Paz"))])

    signup(client)
    verify(client, fake_smtp)

    with Session(engine) as db:
        account = get_account_by_email(db, CLIENT_EMAIL)
        [notice] = db.scalars(
            select(Notification).where(Notification.account_id == account.id)
        ).all()
        assert notice.message == (
            "Encontramos 1 viaje registrado con tu identificación. "
            "Puedes verlos en Mis boletos y Mis reservas."
        )
        assert notice.email_sent_at is not None
    subjects = [message["Subject"] for message in fake_smtp.sent_to(CLIENT_EMAIL)]
    assert subjects[-1] == "Viajes vinculados a tu cuenta - Transporte Interprovincial"


def test_mismatched_names_do_not_link_or_reveal_data(payments, fake_smtp):
    client, engine, data = payments
    sell_in_office(client, data, [(3, passenger(CEDULA, "Juan", "Paz"))])

    response = signup(client, first_name="Pedro", last_name="Mora")

    assert response.status_code == 409
    assert response.json()["detail"] == GENERIC_MISMATCH_MESSAGE
    assert "Juan" not in response.text and "Paz" not in response.text
    with Session(engine) as db:
        assert get_account_by_email(db, CLIENT_EMAIL) is None
    [stored] = passengers_with_id(engine)
    assert stored.account_id is None


def test_swapped_first_and_last_names_do_not_match(payments, fake_smtp):
    client, _, data = payments
    sell_in_office(client, data, [(3, passenger(CEDULA, "Juan", "Paz"))])

    response = signup(client, first_name="Paz", last_name="Juan")

    assert response.status_code == 409
    assert response.json()["detail"] == GENERIC_MISMATCH_MESSAGE


def test_identification_with_an_account_is_rejected(payments, fake_smtp):
    client, _, data = payments
    assert signup(client).status_code == 201

    other = signup(client, email="otra.persona@example.com")

    assert other.status_code == 409
    assert other.json()["detail"] == "La identificación ya tiene un registro previo."


def test_unverified_signup_does_not_expose_the_trips(payments, fake_smtp):
    client, engine, data = payments
    sell_in_office(client, data, [(3, passenger(CEDULA, "Juan", "Paz"))])

    assert signup(client).status_code == 201

    [stored] = passengers_with_id(engine)
    assert stored.account_id is None
    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": CLIENT_EMAIL, "password": PASSWORD},
        headers=ORIGIN,
    )
    assert blocked.status_code == 403
    assert settings.auth_cookie_name not in client.cookies


def test_regular_signup_without_previous_purchases_still_works(payments, fake_smtp):
    client, engine, _ = payments

    assert signup(client, id_number="1756880058").status_code == 201
    assert verify(client, fake_smtp).status_code == 200
    login(client, CLIENT_EMAIL)

    assert client.get("/api/v1/reservations/me").json() == []
    assert client.get("/api/v1/tickets/me").json() == []
    [stored] = passengers_with_id(engine, "1756880058")
    with Session(engine) as db:
        account = get_account_by_email(db, CLIENT_EMAIL)
        assert stored.account_id == account.id
        assert db.scalar(
            select(func.count()).select_from(Notification).where(
                Notification.account_id == account.id
            )
        ) == 0


def test_office_sale_to_an_identification_with_account_appears_in_history(
    payments, fake_smtp
):
    client, _, data = payments
    signup(client)
    verify(client, fake_smtp)

    reservation = sell_in_office(client, data, [(3, passenger(CEDULA, "Juan", "Paz"))])

    login(client, CLIENT_EMAIL)
    reservations = client.get("/api/v1/reservations/me").json()
    assert [item["id"] for item in reservations] == [reservation["id"]]
    assert reservations[0]["channel"] == "office"
    tickets = client.get("/api/v1/tickets/me").json()
    assert [ticket["reservationId"] for ticket in tickets] == [reservation["id"]]


def test_office_email_must_match_the_signup_email(payments, fake_smtp):
    client, engine, data = payments
    person = {**passenger(CEDULA, "Juan", "Paz"), "email": CLIENT_EMAIL}
    sell_in_office(client, data, [(3, person)])

    other_email = signup(client, email="otro.correo@example.com")
    assert other_email.status_code == 409
    assert other_email.json()["detail"] == GENERIC_MISMATCH_MESSAGE

    same_email = signup(client)
    assert same_email.status_code == 201
    assert verify(client, fake_smtp).status_code == 200
    [stored] = passengers_with_id(engine)
    assert stored.account_id is not None


def test_only_the_first_account_to_verify_is_linked(payments, fake_smtp):
    client, engine, data = payments
    sell_in_office(client, data, [(3, passenger(CEDULA, "Juan", "Paz"))])
    second_email = "juan.otro@example.com"
    assert signup(client).status_code == 201
    assert signup(client, email=second_email).status_code == 201

    assert verify(client, fake_smtp).status_code == 200
    late = verify(client, fake_smtp, second_email)

    assert late.status_code == 409
    assert late.json()["detail"] == GENERIC_MISMATCH_MESSAGE
    with Session(engine) as db:
        first = get_account_by_email(db, CLIENT_EMAIL)
        second = get_account_by_email(db, second_email)
        assert passengers_with_id(engine)[0].account_id == first.id
        assert second.is_email_verified is False


def test_group_office_sale_only_shows_the_linked_passenger_seat(payments, fake_smtp):
    client, _, data = payments
    reservation = sell_in_office(
        client,
        data,
        [
            (3, passenger(CEDULA, "Juan", "Paz")),
            (4, passenger("1756660013", "Rosa", "Lema")),
        ],
    )

    signup(client)
    verify(client, fake_smtp)
    login(client, CLIENT_EMAIL)

    [item] = client.get("/api/v1/reservations/me").json()
    assert item["id"] == reservation["id"]
    assert [seat["passengerIdNumber"] for seat in item["seats"]] == [CEDULA]
    assert "Rosa" not in str(item)
    tickets = client.get("/api/v1/tickets/me").json()
    assert len(tickets) == 1


def test_office_reservation_cannot_be_cancelled_by_the_linked_passenger(payments, fake_smtp):
    client, _, data = payments
    reservation = sell_in_office(
        client, data, [(3, passenger(CEDULA, "Juan", "Paz"))], charge=False
    )
    signup(client)
    verify(client, fake_smtp)
    login(client, CLIENT_EMAIL)

    [item] = client.get("/api/v1/reservations/me").json()
    assert item["status"] == "pending_payment"
    # Solo quien la compró (aquí, la oficina) puede gestionarla. La API
    # responde 404 para no revelar reservas que no son de la cuenta.
    cancel = client.post(f"/api/v1/reservations/{reservation['id']}/cancel", headers=ORIGIN)
    assert cancel.status_code == 404


def test_password_reset_also_completes_a_pending_link(payments, fake_smtp):
    client, engine, data = payments
    sell_in_office(client, data, [(3, passenger(CEDULA, "Juan", "Paz"))])
    signup(client)
    client.post("/api/v1/auth/password/forgot", json={"email": CLIENT_EMAIL}, headers=ORIGIN)

    reset = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": CLIENT_EMAIL,
            "code": fake_smtp.last_code(CLIENT_EMAIL),
            "password": "NuevaClave456!",
            "confirmPassword": "NuevaClave456!",
        },
        headers=ORIGIN,
    )

    assert reset.status_code == 200, reset.text
    assert passengers_with_id(engine)[0].account_id is not None


def test_names_are_compared_without_case_accents_or_extra_spaces():
    assert normalize_name("  José   María ") == normalize_name("jose maria")
    assert normalize_name("ÑANDÚ") == normalize_name("nandu")
    assert normalize_name("Juan") != normalize_name("Juana")


def test_existing_accounts_have_no_pending_link(test_environment):
    _, engine = test_environment

    with Session(engine) as db:
        db.add(
            Account(email="vieja@example.com", password_hash="x", account_type=AccountType.PASSENGER)
        )
        db.commit()
        assert get_account_by_email(db, "vieja@example.com").pending_passenger_id is None
