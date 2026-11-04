import pytest

from test_reservations import ORIGIN, login, passenger, reservation_payload, scenario  # noqa: F401


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("idNumber", "1712345678"),  # dígito verificador incorrecto
        ("idNumber", "17123456AB"),
        ("idNumber", "AB1234567"),  # pasaporte
        ("firstName", "Ana2"),
        ("lastName", "Perez!"),
        ("email", "ana@gmail"),
    ],
)
def test_signup_rejects_invalid_fields(test_environment, signup_data, field, value):
    client, _ = test_environment

    response = client.post("/api/v1/auth/signup", json={**signup_data, field: value})

    assert response.status_code == 422, response.text


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("idNumber", "1711111111"),
        ("firstName", "Ana 3"),
        ("phone", "099ABC4567"),
        ("email", "ana@correo"),
    ],
)
def test_reservation_rejects_invalid_passenger_data(scenario, field, value):
    client, _, data = scenario
    login(client, "ana@example.com")
    person = {**passenger(), field: value}

    response = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "quito", "loja", [(1, person)]),
        headers=ORIGIN,
    )

    assert response.status_code == 422, response.text


def test_reservation_accepts_empty_optional_fields(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")
    person = {**passenger(), "phone": "", "email": ""}

    response = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "quito", "loja", [(1, person)]),
        headers=ORIGIN,
    )

    assert response.status_code == 201, response.text
