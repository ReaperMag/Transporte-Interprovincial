from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import Bus, BusTemplate, SeatType, TemplateSeat
from app.modules.cooperatives.models import Cooperative
from app.modules.passengers.models import Passenger, PassengerCategory
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.routes.models import City, Fare, Route, RouteStop, RouteType
from app.modules.schedules.models import Frequency
from app.modules.staff.models import Staff, StaffPosition
from app.modules.trips.models import Trip
from app.modules.trips.service import ECUADOR_TIMEZONE


PASSWORD = "ClaveSegura123!"
ORIGIN = {"Origin": settings.frontend_origin}


def create_account(db, email, account_type, cooperative_id=None):
    account = Account(
        email=email,
        password_hash=hash_password(PASSWORD),
        account_type=account_type,
        cooperative_id=cooperative_id,
    )
    db.add(account)
    db.flush()
    return account


def login(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers=ORIGIN,
    )
    assert response.status_code == 200, response.text


@pytest.fixture
def scenario(test_environment):
    """
    Cooperativa con la ruta Quito - Latacunga - Ambato - Loja,
    un bus de 4 asientos (2 normales y 2 VIP) y un viaje para mañana.
    """
    client, engine = test_environment

    with Session(engine) as db:
        cooperative = Cooperative(name="Cooperativa Andina", ruc="1790000000001")
        other_cooperative = Cooperative(name="Cooperativa Costa", ruc="0990000000001")
        db.add_all([cooperative, other_cooperative])
        db.flush()

        quito = City(name="Quito", province="Pichincha")
        latacunga = City(name="Latacunga", province="Cotopaxi")
        ambato = City(name="Ambato", province="Tungurahua")
        loja = City(name="Loja", province="Loja")
        db.add_all([quito, latacunga, ambato, loja])
        db.flush()

        route = Route(
            cooperative_id=cooperative.id,
            origin_city_id=quito.id,
            destination_city_id=loja.id,
            route_type=RouteType.WITH_STOPS,
            duration_minutes=720,
            stops=[
                RouteStop(city_id=latacunga.id, stop_order=1),
                RouteStop(city_id=ambato.id, stop_order=2),
            ],
        )
        db.add(route)
        db.flush()

        prices = {
            (quito.id, latacunga.id): "4.00",
            (latacunga.id, loja.id): "14.00",
            (quito.id, loja.id): "16.00",
            (quito.id, ambato.id): "6.00",
        }
        for (origin_id, destination_id), price in prices.items():
            for seat_type, extra in ((SeatType.NORMAL, 0), (SeatType.VIP, 2)):
                db.add(
                    Fare(
                        route_id=route.id,
                        origin_city_id=origin_id,
                        destination_city_id=destination_id,
                        seat_type=seat_type,
                        price=Decimal(price) + extra,
                    )
                )

        template = BusTemplate(
            cooperative_id=cooperative.id,
            name="Bus 4 asientos",
            rows=2,
            columns=2,
            seats=[
                TemplateSeat(number=1, row=1, column=1, seat_type=SeatType.VIP),
                TemplateSeat(number=2, row=1, column=2, seat_type=SeatType.VIP),
                TemplateSeat(number=3, row=2, column=1, seat_type=SeatType.NORMAL),
                TemplateSeat(number=4, row=2, column=2, seat_type=SeatType.NORMAL),
            ],
        )
        db.add(template)
        db.flush()

        bus = Bus(
            cooperative_id=cooperative.id,
            number="12",
            plate="PBA-1234",
            chassis_brand="Hino",
            body_brand="Miral",
            template_id=template.id,
        )
        db.add(bus)
        db.flush()

        frequency = Frequency(
            cooperative_id=cooperative.id,
            route_id=route.id,
            departure_time=time(8, 0),
            resolution_number="ANT-001",
        )
        db.add(frequency)
        db.flush()

        trip = Trip(
            cooperative_id=cooperative.id,
            frequency_id=frequency.id,
            bus_id=bus.id,
            departure_at=datetime.now(ECUADOR_TIMEZONE) + timedelta(days=1),
        )
        db.add(trip)

        create_account(db, "ana@example.com", AccountType.PASSENGER)
        create_account(db, "luis@example.com", AccountType.PASSENGER)

        clerk_account = create_account(
            db, "oficina@andina.ec", AccountType.COOPERATIVE, cooperative.id
        )
        db.add(
            Staff(
                cooperative_id=cooperative.id,
                account_id=clerk_account.id,
                first_name="Olga",
                last_name="Oficinista",
                id_number="1800000001",
                position=StaffPosition.CLERK,
            )
        )
        other_clerk = create_account(
            db, "oficina@costa.ec", AccountType.COOPERATIVE, other_cooperative.id
        )
        db.add(
            Staff(
                cooperative_id=other_cooperative.id,
                account_id=other_clerk.id,
                first_name="Carlos",
                last_name="Costa",
                id_number="0900000001",
                position=StaffPosition.CLERK,
            )
        )
        db.commit()

        seat_ids = {
            seat.number: seat.id
            for seat in db.scalars(select(TemplateSeat)).all()
        }

        data = {
            "trip_id": trip.id,
            "seats": seat_ids,
            "quito": quito.id,
            "latacunga": latacunga.id,
            "ambato": ambato.id,
            "loja": loja.id,
            "route_id": route.id,
        }

    return client, engine, data


def passenger(id_number="1711111111", first_name="Ana", last_name="Perez"):
    return {
        "idNumber": id_number,
        "firstName": first_name,
        "lastName": last_name,
    }


def reservation_payload(data, origin, destination, seats):
    return {
        "tripId": data["trip_id"],
        "originCityId": data[origin],
        "destinationCityId": data[destination],
        "seats": [
            {"seatId": data["seats"][number], "passenger": person}
            for number, person in seats
        ],
    }


def seat_map(client, data, origin, destination):
    response = client.get(
        f"/api/v1/reservations/trips/{data['trip_id']}/seats",
        params={
            "origin_city_id": data[origin],
            "destination_city_id": data[destination],
        },
    )
    assert response.status_code == 200, response.text
    return {seat["number"]: seat["isAvailable"] for seat in response.json()["seats"]}


def test_all_seats_are_available_before_any_reservation(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")

    assert seat_map(client, data, "quito", "loja") == {
        1: True,
        2: True,
        3: True,
        4: True,
    }


def test_passenger_reserves_seats_with_fare_and_time_limit(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")

    response = client.post(
        "/api/v1/reservations",
        json=reservation_payload(
            data,
            "quito",
            "loja",
            [(1, passenger()), (3, passenger("1722222222", "Pedro", "Perez"))],
        ),
        headers=ORIGIN,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "pending_payment"
    # Asiento 1 VIP (18.00) + asiento 3 normal (16.00)
    assert Decimal(body["total"]) == Decimal("34.00")
    # Por defecto hay 5 minutos para subir el comprobante.
    expires_at = datetime.fromisoformat(body["expiresAt"]).replace(tzinfo=ECUADOR_TIMEZONE)
    remaining = expires_at - datetime.now(ECUADOR_TIMEZONE)
    assert timedelta(minutes=4) < remaining <= timedelta(minutes=5)
    assert {seat["seatNumber"] for seat in body["seats"]} == {1, 3}

    occupied = seat_map(client, data, "quito", "loja")
    assert occupied[1] is False
    assert occupied[3] is False
    assert occupied[2] is True


def test_seat_is_free_on_segments_that_do_not_overlap(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")

    response = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "quito", "latacunga", [(4, passenger())]),
        headers=ORIGIN,
    )
    assert response.status_code == 201, response.text

    # Quito - Latacunga no se cruza con Latacunga - Loja.
    assert seat_map(client, data, "latacunga", "loja")[4] is True
    # Quito - Ambato sí pasa por el tramo Quito - Latacunga.
    assert seat_map(client, data, "quito", "ambato")[4] is False

    second = client.post(
        "/api/v1/reservations",
        json=reservation_payload(
            data, "latacunga", "loja", [(4, passenger("1733333333", "Rosa", "Lema"))]
        ),
        headers=ORIGIN,
    )
    assert second.status_code == 201, second.text


def test_cannot_reserve_an_occupied_seat(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")

    payload = reservation_payload(data, "quito", "loja", [(2, passenger())])
    assert client.post("/api/v1/reservations", json=payload, headers=ORIGIN).status_code == 201

    login(client, "luis@example.com")
    repeated = client.post(
        "/api/v1/reservations",
        json=reservation_payload(
            data, "quito", "ambato", [(2, passenger("1744444444", "Luis", "Mora"))]
        ),
        headers=ORIGIN,
    )
    assert repeated.status_code == 409


def test_discount_applies_only_to_verified_categories(scenario):
    client, engine, data = scenario

    with Session(engine) as db:
        db.add_all(
            [
                Passenger(
                    id_number="1755555555",
                    first_name="Elena",
                    last_name="Vaca",
                    category=PassengerCategory.SENIOR,
                    category_verified=True,
                ),
                Passenger(
                    id_number="1766666666",
                    first_name="Mario",
                    last_name="Vaca",
                    category=PassengerCategory.SENIOR,
                    category_verified=False,
                ),
            ]
        )
        db.commit()

    login(client, "ana@example.com")
    response = client.post(
        "/api/v1/reservations",
        json=reservation_payload(
            data,
            "quito",
            "loja",
            [
                (3, passenger("1755555555", "Elena", "Vaca")),
                (4, passenger("1766666666", "Mario", "Vaca")),
            ],
        ),
        headers=ORIGIN,
    )

    assert response.status_code == 201, response.text
    prices = {seat["seatNumber"]: seat for seat in response.json()["seats"]}
    assert Decimal(prices[3]["discountAmount"]) == Decimal("8.00")
    assert Decimal(prices[3]["price"]) == Decimal("8.00")
    assert Decimal(prices[4]["discountAmount"]) == Decimal("0.00")
    assert Decimal(response.json()["total"]) == Decimal("24.00")


def test_expired_reservation_releases_its_seats(scenario):
    client, engine, data = scenario
    login(client, "ana@example.com")

    response = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "quito", "loja", [(1, passenger())]),
        headers=ORIGIN,
    )
    reservation_id = response.json()["id"]

    with Session(engine) as db:
        reservation = db.get(Reservation, reservation_id)
        reservation.expires_at = datetime.now(ECUADOR_TIMEZONE) - timedelta(minutes=1)
        db.commit()

    assert seat_map(client, data, "quito", "loja")[1] is True

    detail = client.get(f"/api/v1/reservations/{reservation_id}")
    assert detail.json()["status"] == "expired"


def test_passenger_can_cancel_a_pending_reservation(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")

    created = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "quito", "loja", [(2, passenger())]),
        headers=ORIGIN,
    )
    reservation_id = created.json()["id"]

    cancelled = client.post(
        f"/api/v1/reservations/{reservation_id}/cancel",
        headers=ORIGIN,
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert seat_map(client, data, "quito", "loja")[2] is True

    again = client.post(
        f"/api/v1/reservations/{reservation_id}/cancel",
        headers=ORIGIN,
    )
    assert again.status_code == 409


def test_passenger_only_sees_own_reservations(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")
    created = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "quito", "loja", [(1, passenger())]),
        headers=ORIGIN,
    )
    reservation_id = created.json()["id"]

    mine = client.get("/api/v1/reservations/me")
    assert [item["id"] for item in mine.json()] == [reservation_id]

    login(client, "luis@example.com")
    assert client.get("/api/v1/reservations/me").json() == []
    assert client.get(f"/api/v1/reservations/{reservation_id}").status_code == 404
    assert (
        client.post(
            f"/api/v1/reservations/{reservation_id}/cancel", headers=ORIGIN
        ).status_code
        == 404
    )


def test_clerk_reserves_in_the_office(scenario):
    client, engine, data = scenario
    login(client, "oficina@andina.ec")

    response = client.post(
        "/api/v1/reservations/office",
        json=reservation_payload(
            data, "quito", "loja", [(3, passenger("1777777777", "Juan", "Paz"))]
        ),
        headers=ORIGIN,
    )

    assert response.status_code == 201, response.text
    reservation_id = response.json()["id"]

    with Session(engine) as db:
        reservation = db.get(Reservation, reservation_id)
        assert reservation.buyer_account_id is None
        assert reservation.sold_by_id is not None
        assert reservation.status == ReservationStatus.PENDING_PAYMENT

    # El oficinista puede ver y cancelar las reservas de su cooperativa.
    assert client.get(f"/api/v1/reservations/{reservation_id}").status_code == 200


def test_office_sale_is_limited_to_staff_of_the_trip_cooperative(scenario):
    client, _, data = scenario
    payload = reservation_payload(data, "quito", "loja", [(3, passenger())])

    login(client, "ana@example.com")
    assert (
        client.post("/api/v1/reservations/office", json=payload, headers=ORIGIN).status_code
        == 403
    )

    login(client, "oficina@costa.ec")
    assert (
        client.post("/api/v1/reservations/office", json=payload, headers=ORIGIN).status_code
        == 404
    )


def test_rejects_invalid_segments(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")

    reverse = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "loja", "quito", [(1, passenger())]),
        headers=ORIGIN,
    )
    assert reverse.status_code == 422

    # Ambato - Loja no tiene una tarifa registrada.
    without_fare = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "ambato", "loja", [(1, passenger())]),
        headers=ORIGIN,
    )
    assert without_fare.status_code == 422


def test_direct_route_only_sells_from_its_origin(scenario):
    client, engine, data = scenario

    with Session(engine) as db:
        route = db.get(Route, data["route_id"])
        route.route_type = RouteType.DIRECT
        db.commit()

    login(client, "ana@example.com")
    response = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "latacunga", "loja", [(1, passenger())]),
        headers=ORIGIN,
    )
    assert response.status_code == 422


def test_reservation_requires_the_frontend_origin(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")

    response = client.post(
        "/api/v1/reservations",
        json=reservation_payload(data, "quito", "loja", [(1, passenger())]),
    )
    assert response.status_code == 403


def test_rejects_repeated_seats_or_passengers(scenario):
    client, _, data = scenario
    login(client, "ana@example.com")

    repeated_seat = reservation_payload(
        data,
        "quito",
        "loja",
        [(1, passenger()), (1, passenger("1788888888", "Eva", "Rios"))],
    )
    assert (
        client.post("/api/v1/reservations", json=repeated_seat, headers=ORIGIN).status_code
        == 422
    )

    repeated_passenger = reservation_payload(
        data, "quito", "loja", [(1, passenger()), (2, passenger())]
    )
    assert (
        client.post(
            "/api/v1/reservations", json=repeated_passenger, headers=ORIGIN
        ).status_code
        == 422
    )
