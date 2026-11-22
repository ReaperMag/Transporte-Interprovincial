from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.modules.tickets.models import SaleChannel, Ticket, TicketStatus
from test_bus_staff_trips import (  # noqa: F401
    DRIVER,
    ORIGIN,
    TRIPS_URL,
    bus_trip,
    login,
    passenger,
    payments,
    regular_ticket,
    scenario,
    start_boarding,
)


def options_url(data) -> str:
    return f"{TRIPS_URL}/{data['trip_id']}/onboard-sales/options"


def sales_url(data) -> str:
    return f"{TRIPS_URL}/{data['trip_id']}/onboard-sales"


@pytest.fixture
def trip_in_progress(bus_trip):
    """Viaje en curso con el asiento 3 vendido y abordado; el resto está libre."""
    client, engine, data = bus_trip
    ticket = regular_ticket(client, engine, data)
    start_boarding(client, data)
    client.post(
        f"{TRIPS_URL}/{data['trip_id']}/tickets/validate",
        json={"code": ticket.code},
        headers=ORIGIN,
    )
    started = client.post(f"{TRIPS_URL}/{data['trip_id']}/start", headers=ORIGIN)
    assert started.status_code == 200, started.text
    return client, engine, data


def sale(data, seat: int, **changes) -> dict:
    return {
        "seatId": data["seats"][seat],
        "passenger": {
            "idNumber": "1722222229",
            "firstName": "Pedro",
            "lastName": "Viajero",
            "category": "regular",
        },
        "originCityId": data["latacunga"],
        "destinationCityId": data["loja"],
        "boardingDescription": "Gasolinera de Salcedo",
        "destinationDescription": "Terminal de Loja",
        **changes,
    }


# ---------------------------------------------------------------------------
# Opciones de venta
# ---------------------------------------------------------------------------


def test_options_show_stops_free_seats_and_suggested_fare(trip_in_progress):
    client, _, data = trip_in_progress

    response = client.get(
        options_url(data),
        params={"originCityId": data["latacunga"], "destinationCityId": data["loja"]},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert [stop["cityName"] for stop in body["stops"]] == [
        "Quito",
        "Latacunga",
        "Ambato",
        "Loja",
    ]
    seats = {seat["seatNumber"]: seat for seat in body["seats"]}
    assert seats[3]["isFree"] is False
    assert seats[4]["isFree"] is True
    assert Decimal(seats[4]["suggestedPrice"]) == Decimal("14.00")
    assert Decimal(seats[1]["suggestedPrice"]) == Decimal("16.00")


def test_options_without_fare_have_no_suggested_price(trip_in_progress):
    client, _, data = trip_in_progress

    response = client.get(
        options_url(data),
        params={"originCityId": data["ambato"], "destinationCityId": data["loja"]},
    )

    assert response.status_code == 200
    assert {seat["suggestedPrice"] for seat in response.json()["seats"]} == {None}


def test_sale_is_only_allowed_while_the_trip_is_in_progress(bus_trip):
    client, _, data = bus_trip
    start_boarding(client, data)

    assert client.get(options_url(data)).status_code == 409
    response = client.post(sales_url(data), json=sale(data, 4), headers=ORIGIN)
    assert response.status_code == 409
    assert "en curso" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Registro de la venta
# ---------------------------------------------------------------------------


def test_onboard_sale_charges_the_suggested_fare_in_cash(trip_in_progress):
    client, engine, data = trip_in_progress

    response = client.post(sales_url(data), json=sale(data, 4), headers=ORIGIN)

    assert response.status_code == 201, response.text
    body = response.json()
    assert Decimal(body["price"]) == Decimal("14.00")
    assert body["seatNumber"] == 4
    assert body["originCityName"] == "Latacunga"
    assert body["boardingDescription"] == "Gasolinera de Salcedo"
    assert body["soldByName"] == "Carlos Conductor"
    sold_at = datetime.fromisoformat(body["soldAt"])
    assert sold_at.utcoffset() == timedelta(hours=-5)
    with Session(engine) as db:
        ticket = db.get(Ticket, body["ticketId"])
        assert ticket.channel == SaleChannel.ON_BOARD
        assert ticket.status == TicketStatus.USED
        assert ticket.reservation_seat_id is None
        assert ticket.sold_by_id == ticket.validated_by_id


def test_discount_category_halves_the_suggested_fare(trip_in_progress):
    client, _, data = trip_in_progress
    person = {
        "idNumber": "1733333338",
        "firstName": "Rosa",
        "lastName": "Mora",
        "category": "senior",
    }

    response = client.post(sales_url(data), json=sale(data, 4, passenger=person), headers=ORIGIN)

    assert response.status_code == 201, response.text
    assert Decimal(response.json()["price"]) == Decimal("7.00")


def test_price_can_be_written_by_hand(trip_in_progress):
    client, _, data = trip_in_progress

    response = client.post(
        sales_url(data),
        json=sale(data, 4, originCityId=data["ambato"], price="9.50"),
        headers=ORIGIN,
    )

    assert response.status_code == 201, response.text
    assert Decimal(response.json()["price"]) == Decimal("9.50")


def test_price_is_required_when_the_segment_has_no_fare(trip_in_progress):
    client, _, data = trip_in_progress

    response = client.post(
        sales_url(data), json=sale(data, 4, originCityId=data["ambato"]), headers=ORIGIN
    )

    assert response.status_code == 422
    assert "escribe el precio" in response.json()["detail"]


def test_occupied_seat_cannot_be_sold(trip_in_progress):
    client, _, data = trip_in_progress
    first = client.post(sales_url(data), json=sale(data, 4), headers=ORIGIN)
    assert first.status_code == 201

    taken = client.post(
        sales_url(data),
        json=sale(data, 4, passenger={**passenger("1733333338"), "category": "regular"}),
        headers=ORIGIN,
    )
    boarded = client.post(sales_url(data), json=sale(data, 3), headers=ORIGIN)

    assert taken.status_code == 409
    assert boarded.status_code == 409


def test_seat_of_a_passenger_who_did_not_board_can_be_sold(bus_trip):
    client, engine, data = bus_trip
    regular_ticket(client, engine, data)
    start_boarding(client, data)
    client.post(f"{TRIPS_URL}/{data['trip_id']}/start", headers=ORIGIN)

    response = client.post(sales_url(data), json=sale(data, 3), headers=ORIGIN)

    assert response.status_code == 201, response.text


@pytest.mark.parametrize(
    "changes",
    [
        {"seatId": 999999},
        {"originCityId": 999999},
        {"originCityId": "loja_first"},
        {"boardingDescription": ""},
        {"price": "0"},
        {"passenger": {"idNumber": "1234567890", "firstName": "Ana", "lastName": "Paz"}},
    ],
)
def test_invalid_onboard_sale_is_rejected(trip_in_progress, changes):
    client, _, data = trip_in_progress
    if changes.get("originCityId") == "loja_first":
        changes = {"originCityId": data["loja"], "destinationCityId": data["latacunga"]}

    response = client.post(sales_url(data), json=sale(data, 4, **changes), headers=ORIGIN)

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Lista de ventas
# ---------------------------------------------------------------------------


def test_onboard_sales_list_shows_the_cash_total(trip_in_progress):
    client, _, data = trip_in_progress
    client.post(sales_url(data), json=sale(data, 4), headers=ORIGIN)
    client.post(
        sales_url(data),
        json=sale(
            data,
            1,
            passenger={**passenger("1733333338", "Rosa", "Mora"), "category": "regular"},
            price="12.00",
        ),
        headers=ORIGIN,
    )

    response = client.get(sales_url(data))

    assert response.status_code == 200, response.text
    assert [item["seatNumber"] for item in response.json()["sales"]] == [4, 1]
    assert Decimal(response.json()["total"]) == Decimal("26.00")


def test_only_bus_staff_of_the_bus_sees_the_sales(trip_in_progress):
    client, _, data = trip_in_progress

    login(client, "oficina@andina.ec")

    assert client.get(sales_url(data)).status_code == 403
    assert client.post(sales_url(data), json=sale(data, 4), headers=ORIGIN).status_code == 403
