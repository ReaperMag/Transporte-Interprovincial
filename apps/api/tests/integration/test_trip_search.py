from datetime import datetime, timedelta

from app.modules.trips.service import ECUADOR_TIMEZONE
from test_reservations import ORIGIN, login, passenger, reservation_payload, scenario  # noqa: F401


SEARCH_URL = "/api/v1/trips/search"


def test_guest_can_browse_and_filter_upcoming_trips(scenario):
    client, _, data = scenario
    response = client.get("/api/v1/trips/public/search")

    assert response.status_code == 200
    assert [trip["tripId"] for trip in response.json()] == [data["trip_id"]]
    assert client.get("/api/v1/trips/public/cities").status_code == 200
    assert client.get(
        "/api/v1/trips/public/search",
        params={"origin_city_id": data["loja"]},
    ).json() == []
    assert client.get(
        "/api/v1/trips/public/search",
        params={"origin_city_id": data["quito"], "destination_city_id": data["quito"]},
    ).status_code == 422
    assert client.get(SEARCH_URL).status_code == 401
    assert client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "quito", "loja", [(3, passenger())]),
        headers=ORIGIN,
    ).status_code == 401


def test_without_filters_lists_every_available_trip(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")

    response = client.get(SEARCH_URL)

    assert response.status_code == 200, response.text
    trips = response.json()
    assert [trip["tripId"] for trip in trips] == [data["trip_id"]]
    assert trips[0]["originCityName"] == "Quito"
    assert trips[0]["destinationCityName"] == "Loja"
    assert {fare["seatType"] for fare in trips[0]["fares"]} == {"normal", "vip"}


def test_each_filter_narrows_the_results(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")
    tomorrow = (datetime.now(ECUADOR_TIMEZONE) + timedelta(days=1)).date().isoformat()
    later = (datetime.now(ECUADOR_TIMEZONE) + timedelta(days=5)).date().isoformat()

    def found(**params):
        response = client.get(SEARCH_URL, params=params)
        assert response.status_code == 200, response.text
        return [trip["tripId"] for trip in response.json()]

    assert found(origin_city_id=data["quito"]) == [data["trip_id"]]
    assert found(destination_city_id=data["loja"]) == [data["trip_id"]]
    assert found(travel_date=tomorrow) == [data["trip_id"]]
    assert found(
        origin_city_id=data["quito"], destination_city_id=data["loja"], travel_date=tomorrow
    ) == [data["trip_id"]]

    assert found(origin_city_id=data["loja"]) == []
    assert found(travel_date=later) == []


def test_origin_and_destination_must_be_different(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")

    response = client.get(
        SEARCH_URL,
        params={"origin_city_id": data["quito"], "destination_city_id": data["quito"]},
    )

    assert response.status_code == 422
