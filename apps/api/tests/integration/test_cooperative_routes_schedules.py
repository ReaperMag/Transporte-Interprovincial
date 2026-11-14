from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import Bus, BusGroup, BusTemplate
from app.modules.cooperatives import service
from app.modules.cooperatives.models import Cooperative
from app.modules.roles_permissions.seed import COOPERATIVE_ADMIN_ROLE, ensure_default_roles
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.routes.geographic_service import ensure_geographic_catalog
from app.modules.routes.models import City, Fare
from app.modules.trips.models import Trip


PASSWORD = "ClaveCooperativa123!"
PLANNING_URL = "/api/v1/cooperatives/me/route-planning"


def create_cooperative_account(engine) -> Cooperative:
    with Session(engine) as db:
        cooperative = service.create_cooperative(
            db,
            {"name": "Cooperativa Rutas", "ruc": "1791234567001"},
        )
        role = ensure_default_roles(db)[COOPERATIVE_ADMIN_ROLE]
        db.add(
            Account(
                email="rutas@example.com",
                password_hash=hash_password(PASSWORD),
                account_type=AccountType.COOPERATIVE,
                cooperative_id=cooperative.id,
                role_id=role.id,
            )
        )
        db.commit()
        db.refresh(cooperative)
        return cooperative


def login(client):
    return client.post(
        "/api/v1/auth/login",
        json={"email": "rutas@example.com", "password": PASSWORD},
        headers={"Origin": settings.frontend_origin},
    )


def create_group_and_buses(engine, cooperative_id: int) -> tuple[int, list[int]]:
    with Session(engine) as db:
        group = BusGroup(cooperative_id=cooperative_id, name="Interprovincial")
        template = BusTemplate(
            cooperative_id=cooperative_id,
            name="Bus de prueba",
            floors=1,
            has_bathroom=True,
            rows=4,
            columns=4,
        )
        db.add_all([group, template])
        db.flush()
        buses = [
            Bus(
                cooperative_id=cooperative_id,
                number=f"{index:02}",
                plate=f"ABC-123{index}",
                chassis_brand="Hino",
                body_brand="Marcopolo",
                template_id=template.id,
                group_id=group.id,
                status="operativo",
                is_active=True,
            )
            for index in (1, 2)
        ]
        db.add_all(buses)
        db.commit()
        return group.id, [bus.id for bus in buses]


def create_city(client, name: str, province: str) -> int:
    with client.app.state.session_factory() as db:
        ensure_geographic_catalog(db)
        city = db.scalar(
            select(City).where(
                City.name == name,
                City.province == province,
                City.canton != "",
                City.is_catalogued.is_(True),
            )
        )
        assert city is not None, f"Missing preloaded locality: {name}, {province}"
        return city.id


def test_cooperative_cannot_create_a_catalog_location(test_environment):
    client, engine = test_environment
    create_cooperative_account(engine)
    assert login(client).status_code == 200

    response = client.post(
        f"{PLANNING_URL}/cities",
        json={"name": "Localidad inventada", "province": "Pichincha"},
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 403
    locality_response = client.post(
        "/api/v1/admin/geographic-catalog/localities",
        json={
            "name": "Localidad inventada",
            "province": "Pichincha",
            "canton": "Quito",
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert locality_response.status_code == 403


def test_routes_can_only_use_catalogued_localities(test_environment):
    client, engine = test_environment
    create_cooperative_account(engine)
    assert login(client).status_code == 200
    destination_id = create_city(client, "Ambato", "Tungurahua")
    with client.app.state.session_factory() as db:
        canton = db.scalar(
            select(City).where(
                City.name == "Quito",
                City.province == "Pichincha",
                City.canton == "",
            )
        )
        assert canton is not None
        origin_id = canton.id

    response = client.post(
        f"{PLANNING_URL}/routes",
        json={
            "originCityId": origin_id,
            "destinationCityId": destination_id,
            "durationMinutes": 180,
            "stops": [],
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 404


def create_route(
    client,
    origin_id: int,
    destination_id: int,
    *,
    duration: int,
    stops=None,
    fares=None,
):
    response = client.post(
        f"{PLANNING_URL}/routes",
        json={
            "originCityId": origin_id,
            "destinationCityId": destination_id,
            "durationMinutes": duration,
            "stops": stops or [],
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert response.status_code == 201
    route = response.json()

    route_fares = [
        {"seatType": "normal", "price": "8.00"},
        {"seatType": "vip", "price": "12.00"},
    ] if fares is None else fares
    if not route_fares:
        return route

    fare_response = client.put(
        f"{PLANNING_URL}/routes/{route['id']}/fares",
        json={
            "fares": [
                {
                    "originCityId": origin_id,
                    "destinationCityId": destination_id,
                    **fare,
                }
                for fare in route_fares
            ]
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert fare_response.status_code == 200, fare_response.text
    return fare_response.json()


def create_frequency(client, route_id: int, group_id: int, departure: str):
    response = client.post(
        f"{PLANNING_URL}/frequencies",
        json={
            "routeId": route_id,
            "busGroupId": group_id,
            "departureTime": departure,
            "resolutionNumber": f"ANT-{departure}",
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert response.status_code == 201
    return response.json()


def test_cooperative_can_create_route_with_ordered_stops_and_group_frequency(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(engine)
    assert login(client).status_code == 200
    group_id, _ = create_group_and_buses(engine, cooperative.id)

    ambato_id = create_city(client, "Ambato", "Tungurahua")
    latacunga_id = create_city(client, "Latacunga", "Cotopaxi")
    quito_id = create_city(client, "Quito", "Pichincha")
    route = create_route(
        client,
        ambato_id,
        quito_id,
        duration=180,
        stops=[{"cityId": latacunga_id, "minutesFromOrigin": 65}],
    )
    frequency = create_frequency(client, route["id"], group_id, "08:00")

    assert route["routeType"] == "with_stops"
    assert route["stops"][0]["cityName"] == "Latacunga"
    assert frequency["busGroupId"] == group_id
    assert frequency["routeName"] == "Ambato - Quito"
    assert frequency["durationMinutes"] == 180


def test_published_route_sheet_frequency_appears_in_passenger_trip_search(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(engine)
    assert login(client).status_code == 200
    group_id, bus_ids = create_group_and_buses(engine, cooperative.id)
    origin_id = create_city(client, "Quito", "Pichincha")
    destination_id = create_city(client, "Ambato", "Tungurahua")
    route = create_route(client, origin_id, destination_id, duration=180)
    frequency = create_frequency(client, route["id"], group_id, "08:00")
    service_date = date.today() + timedelta(days=1)

    saved = client.put(
        f"{PLANNING_URL}/route-sheets",
        json={
            "busGroupId": group_id,
            "serviceDate": service_date.isoformat(),
            "assignments": [{"frequencyId": frequency["id"], "busId": bus_ids[0]}],
            "startingLocations": [{"busId": bus_ids[0], "cityId": origin_id}],
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert saved.status_code == 200, saved.text

    published = client.post(
        f"{PLANNING_URL}/route-sheets/{saved.json()['id']}/publish",
        headers={"Origin": settings.frontend_origin},
    )
    assert published.status_code == 200, published.text

    second_frequency = create_frequency(client, route["id"], group_id, "12:00")
    updated_sheet = client.get(
        f"{PLANNING_URL}/route-sheets",
        params={"groupId": group_id, "serviceDate": service_date.isoformat()},
    )
    assert updated_sheet.status_code == 200, updated_sheet.text
    assert {
        item["frequencyId"] for item in updated_sheet.json()["frequencies"]
    } == {frequency["id"], second_frequency["id"]}
    assert updated_sheet.json()["canReassign"] is True

    updated = client.put(
        f"{PLANNING_URL}/route-sheets",
        json={
            "busGroupId": group_id,
            "serviceDate": service_date.isoformat(),
            "assignments": [
                {"frequencyId": frequency["id"], "busId": bus_ids[0]},
                {"frequencyId": second_frequency["id"], "busId": bus_ids[1]},
            ],
            "startingLocations": [
                {"busId": bus_ids[0], "cityId": origin_id},
                {"busId": bus_ids[1], "cityId": origin_id},
            ],
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "published"

    with Session(engine) as db:
        db.add(
            Account(
                email="pasajero-viajes@example.com",
                password_hash=hash_password(PASSWORD),
                account_type=AccountType.PASSENGER,
            )
        )
        db.commit()

    client.cookies.clear()
    passenger_login = client.post(
        "/api/v1/auth/login",
        json={"email": "pasajero-viajes@example.com", "password": PASSWORD},
        headers={"Origin": settings.frontend_origin},
    )
    assert passenger_login.status_code == 200, passenger_login.text

    search = client.get(
        "/api/v1/trips/search",
        params={
            "origin_city_id": origin_id,
            "destination_city_id": destination_id,
            "travel_date": service_date.isoformat(),
        },
    )
    assert search.status_code == 200, search.text
    assert len(search.json()) == 2
    assert all(trip["routeId"] == route["id"] for trip in search.json())
    assert all(trip["fares"] for trip in search.json())


def test_route_frequencies_must_share_one_bus_group(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(engine)
    assert login(client).status_code == 200
    group_id, _ = create_group_and_buses(engine, cooperative.id)
    with Session(engine) as db:
        other_group = BusGroup(cooperative_id=cooperative.id, name="Otro grupo")
        db.add(other_group)
        db.commit()
        db.refresh(other_group)
        other_group_id = other_group.id

    origin_id = create_city(client, "Quito", "Pichincha")
    destination_id = create_city(client, "Ambato", "Tungurahua")
    route = create_route(client, origin_id, destination_id, duration=180)
    create_frequency(client, route["id"], group_id, "08:00")

    response = client.post(
        f"{PLANNING_URL}/frequencies",
        json={
            "routeId": route["id"],
            "busGroupId": other_group_id,
            "departureTime": "09:00",
            "resolutionNumber": "ANT-09:00",
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 409
    assert "mismo grupo de buses" in response.json()["detail"]


def test_route_without_full_fares_cannot_be_assigned_to_a_sheet(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(engine)
    assert login(client).status_code == 200
    group_id, bus_ids = create_group_and_buses(engine, cooperative.id)
    origin_id = create_city(client, "Quito", "Pichincha")
    destination_id = create_city(client, "Ambato", "Tungurahua")
    route = create_route(client, origin_id, destination_id, duration=180)
    frequency = create_frequency(client, route["id"], group_id, "08:00")
    with Session(engine) as db:
        db.execute(delete(Fare).where(Fare.route_id == route["id"]))
        db.commit()

    response = client.put(
        f"{PLANNING_URL}/route-sheets",
        json={
            "busGroupId": group_id,
            "serviceDate": (date.today() + timedelta(days=1)).isoformat(),
            "assignments": [{"frequencyId": frequency["id"], "busId": bus_ids[0]}],
            "startingLocations": [{"busId": bus_ids[0], "cityId": origin_id}],
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 409
    assert "tarifas Normal y VIP" in response.json()["detail"]


def test_cooperative_can_set_and_update_route_fares(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(engine)
    assert login(client).status_code == 200
    origin_id = create_city(client, "Quito", "Pichincha")
    destination_id = create_city(client, "Ambato", "Tungurahua")
    fares = [
        {"seatType": "normal", "price": "8.00"},
        {"seatType": "vip", "price": "12.50"},
    ]

    route = create_route(
        client,
        origin_id,
        destination_id,
        duration=180,
        fares=fares,
    )

    assert route["fares"] == [
        {
            "originCityId": origin_id,
            "destinationCityId": destination_id,
            **fare,
        }
        for fare in fares
    ]
    listed_route = next(
        item
        for item in client.get(f"{PLANNING_URL}/routes").json()
        if item["id"] == route["id"]
    )
    assert listed_route["fares"] == [
        {
            "originCityId": origin_id,
            "destinationCityId": destination_id,
            **fare,
        }
        for fare in fares
    ]

    updated_fares = [
        {
            "originCityId": origin_id,
            "destinationCityId": destination_id,
            "seatType": "normal",
            "price": "9.00",
        },
        {
            "originCityId": origin_id,
            "destinationCityId": destination_id,
            "seatType": "vip",
            "price": "13.50",
        },
    ]
    response = client.put(
        f"{PLANNING_URL}/routes/{route['id']}/fares",
        json={"fares": updated_fares},
        headers={"Origin": settings.frontend_origin},
    )
    assert response.status_code == 200, response.text
    assert response.json()["fares"] == updated_fares


def test_route_rejects_subroutes_out_of_order(test_environment):
    client, engine = test_environment
    create_cooperative_account(engine)
    assert login(client).status_code == 200

    response = client.post(
        f"{PLANNING_URL}/routes",
        json={
            "originCityId": 1,
            "destinationCityId": 2,
            "durationMinutes": 180,
            "stops": [
                {"cityId": 3, "minutesFromOrigin": 90},
                {"cityId": 4, "minutesFromOrigin": 60},
            ],
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 422


def test_route_sheet_rejects_route_conflict_and_allows_replacement_bus(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(engine)
    assert login(client).status_code == 200
    group_id, bus_ids = create_group_and_buses(engine, cooperative.id)
    ambato_id = create_city(client, "Ambato", "Tungurahua")
    quito_id = create_city(client, "Quito", "Pichincha")
    outbound = create_route(client, ambato_id, quito_id, duration=240)
    return_route = create_route(client, quito_id, ambato_id, duration=240)
    outbound_frequency = create_frequency(client, outbound["id"], group_id, "08:00")
    return_frequency = create_frequency(client, return_route["id"], group_id, "11:00")
    service_date = "2030-01-01"

    conflict = client.put(
        f"{PLANNING_URL}/route-sheets",
        json={
            "busGroupId": group_id,
            "serviceDate": service_date,
            "assignments": [
                {"frequencyId": outbound_frequency["id"], "busId": bus_ids[0]},
                {"frequencyId": return_frequency["id"], "busId": bus_ids[0]},
            ],
            "startingLocations": [{"busId": bus_ids[0], "cityId": ambato_id}],
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert conflict.status_code == 409
    assert "se cruza" in conflict.json()["detail"]

    saved = client.put(
        f"{PLANNING_URL}/route-sheets",
        json={
            "busGroupId": group_id,
            "serviceDate": service_date,
            "assignments": [
                {"frequencyId": outbound_frequency["id"], "busId": bus_ids[1]},
                {"frequencyId": return_frequency["id"], "busId": bus_ids[0]},
            ],
            "startingLocations": [
                {"busId": bus_ids[0], "cityId": quito_id},
                {"busId": bus_ids[1], "cityId": ambato_id},
            ],
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert saved.status_code == 200
    assert saved.json()["status"] == "draft"
    assert {row["busId"] for row in saved.json()["frequencies"]} == set(bus_ids)
    published = client.post(
        f"{PLANNING_URL}/route-sheets/{saved.json()['id']}/publish",
        headers={"Origin": settings.frontend_origin},
    )
    assert published.status_code == 200
    assert published.json()["status"] == "published"
    edit_published = client.put(
        f"{PLANNING_URL}/route-sheets",
        json={
            "busGroupId": group_id,
            "serviceDate": service_date,
            "assignments": [
                {"frequencyId": outbound_frequency["id"], "busId": bus_ids[0]},
                {"frequencyId": return_frequency["id"], "busId": bus_ids[0]},
            ],
            "startingLocations": [{"busId": bus_ids[0], "cityId": ambato_id}],
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert edit_published.status_code == 409


def test_route_sheet_requires_correct_starting_city_and_disallows_edit_after_publish(
    test_environment,
):
    client, engine = test_environment
    cooperative = create_cooperative_account(engine)
    assert login(client).status_code == 200
    group_id, bus_ids = create_group_and_buses(engine, cooperative.id)
    ambato_id = create_city(client, "Ambato", "Tungurahua")
    quito_id = create_city(client, "Quito", "Pichincha")
    route = create_route(client, ambato_id, quito_id, duration=180)
    frequency = create_frequency(client, route["id"], group_id, "08:00")

    invalid_location = client.put(
        f"{PLANNING_URL}/route-sheets",
        json={
            "busGroupId": group_id,
            "serviceDate": date(2030, 1, 1).isoformat(),
            "assignments": [{"frequencyId": frequency["id"], "busId": bus_ids[0]}],
            "startingLocations": [{"busId": bus_ids[0], "cityId": quito_id}],
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert invalid_location.status_code == 409
    assert "ubicación inicial" in invalid_location.json()["detail"]


def test_draft_route_sheet_can_replace_a_bus(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(engine)
    assert login(client).status_code == 200
    group_id, bus_ids = create_group_and_buses(engine, cooperative.id)
    ambato_id = create_city(client, "Ambato", "Tungurahua")
    quito_id = create_city(client, "Quito", "Pichincha")
    route = create_route(client, ambato_id, quito_id, duration=180)
    frequency = create_frequency(client, route["id"], group_id, "08:00")
    payload = {
        "busGroupId": group_id,
        "serviceDate": "2030-01-01",
        "assignments": [{"frequencyId": frequency["id"], "busId": bus_ids[0]}],
        "startingLocations": [{"busId": bus_ids[0], "cityId": ambato_id}],
    }

    initial = client.put(
        f"{PLANNING_URL}/route-sheets",
        json=payload,
        headers={"Origin": settings.frontend_origin},
    )
    assert initial.status_code == 200
    assert initial.json()["frequencies"][0]["busId"] == bus_ids[0]

    payload["assignments"] = [{"frequencyId": frequency["id"], "busId": bus_ids[1]}]
    payload["startingLocations"] = [{"busId": bus_ids[1], "cityId": ambato_id}]
    replacement = client.put(
        f"{PLANNING_URL}/route-sheets",
        json=payload,
        headers={"Origin": settings.frontend_origin},
    )

    assert replacement.status_code == 200
    assert replacement.json()["frequencies"][0]["busId"] == bus_ids[1]


def test_published_route_sheet_allows_replacement_only_without_reservations(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(engine)
    assert login(client).status_code == 200
    group_id, bus_ids = create_group_and_buses(engine, cooperative.id)
    ambato_id = create_city(client, "Ambato", "Tungurahua")
    quito_id = create_city(client, "Quito", "Pichincha")
    route = create_route(client, ambato_id, quito_id, duration=180)
    frequency = create_frequency(client, route["id"], group_id, "08:00")
    service_date = (date.today() + timedelta(days=365)).isoformat()
    payload = {
        "busGroupId": group_id,
        "serviceDate": service_date,
        "assignments": [{"frequencyId": frequency["id"], "busId": bus_ids[0]}],
        "startingLocations": [{"busId": bus_ids[0], "cityId": ambato_id}],
    }

    saved = client.put(
        f"{PLANNING_URL}/route-sheets",
        json=payload,
        headers={"Origin": settings.frontend_origin},
    )
    assert saved.status_code == 200
    published = client.post(
        f"{PLANNING_URL}/route-sheets/{saved.json()['id']}/publish",
        headers={"Origin": settings.frontend_origin},
    )
    assert published.status_code == 200
    assert published.json()["canReassign"] is True

    payload["assignments"] = [{"frequencyId": frequency["id"], "busId": bus_ids[1]}]
    payload["startingLocations"] = [{"busId": bus_ids[1], "cityId": ambato_id}]
    replacement = client.put(
        f"{PLANNING_URL}/route-sheets",
        json=payload,
        headers={"Origin": settings.frontend_origin},
    )
    assert replacement.status_code == 200
    assert replacement.json()["frequencies"][0]["busId"] == bus_ids[1]

    with Session(engine) as db:
        trip = db.query(Trip).filter_by(route_sheet_id=published.json()["id"]).one()
        db.add(
            Reservation(
                trip_id=trip.id,
                status=ReservationStatus.PENDING_PAYMENT,
            )
        )
        db.commit()

    sheet_url = f"{PLANNING_URL}/route-sheets?groupId={group_id}&serviceDate={service_date}"
    sheet_with_reservation = client.get(
        sheet_url,
        headers={"Origin": settings.frontend_origin},
    )
    assert sheet_with_reservation.status_code == 200
    assert sheet_with_reservation.json()["canReassign"] is False

    payload["assignments"] = [{"frequencyId": frequency["id"], "busId": bus_ids[0]}]
    payload["startingLocations"] = [{"busId": bus_ids[0], "cityId": ambato_id}]
    blocked_replacement = client.put(
        f"{PLANNING_URL}/route-sheets",
        json=payload,
        headers={"Origin": settings.frontend_origin},
    )
    assert blocked_replacement.status_code == 409

def test_cooperative_sets_route_fares_per_segment_and_seat_type(test_environment):
    from decimal import Decimal

    client, engine = test_environment
    create_cooperative_account(engine)
    assert login(client).status_code == 200

    ambato_id = create_city(client, "Ambato", "Tungurahua")
    latacunga_id = create_city(client, "Latacunga", "Cotopaxi")
    quito_id = create_city(client, "Quito", "Pichincha")
    route = create_route(
        client,
        ambato_id,
        quito_id,
        duration=180,
        stops=[{"cityId": latacunga_id, "minutesFromOrigin": 65}],
        fares=[],
    )

    response = client.put(
        f"{PLANNING_URL}/routes/{route['id']}/fares",
        json={
            "fares": [
                {
                    "originCityId": ambato_id,
                    "destinationCityId": latacunga_id,
                    "seatType": "normal",
                    "price": 2.5,
                },
                {
                    "originCityId": ambato_id,
                    "destinationCityId": latacunga_id,
                    "seatType": "vip",
                    "price": 3.5,
                },
                {
                    "originCityId": latacunga_id,
                    "destinationCityId": quito_id,
                    "seatType": "normal",
                    "price": 3,
                },
                {
                    "originCityId": ambato_id,
                    "destinationCityId": quito_id,
                    "seatType": "normal",
                    "price": 5,
                },
            ]
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert response.status_code == 200
    fares = {
        (fare["originCityId"], fare["destinationCityId"], fare["seatType"]): Decimal(
            fare["price"]
        )
        for fare in response.json()["fares"]
    }
    assert fares[(ambato_id, latacunga_id, "normal")] == Decimal("2.50")
    assert fares[(ambato_id, latacunga_id, "vip")] == Decimal("3.50")
    assert fares[(ambato_id, quito_id, "normal")] == Decimal("5.00")

    updated = client.put(
        f"{PLANNING_URL}/routes/{route['id']}/fares",
        json={
            "fares": [
                {
                    "originCityId": ambato_id,
                    "destinationCityId": quito_id,
                    "seatType": "normal",
                    "price": 6.25,
                }
            ]
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert updated.status_code == 200
    updated_fares = {
        (fare["originCityId"], fare["destinationCityId"], fare["seatType"]): Decimal(
            fare["price"]
        )
        for fare in updated.json()["fares"]
    }
    assert updated_fares[(ambato_id, quito_id, "normal")] == Decimal("6.25")
    assert updated_fares[(ambato_id, latacunga_id, "normal")] == Decimal("2.50")

    routes = client.get(f"{PLANNING_URL}/routes").json()
    route_read = next(item for item in routes if item["id"] == route["id"])
    assert len(route_read["fares"]) == 4

    invalid_segment = client.put(
        f"{PLANNING_URL}/routes/{route['id']}/fares",
        json={
            "fares": [
                {
                    "originCityId": quito_id,
                    "destinationCityId": ambato_id,
                    "seatType": "normal",
                    "price": 5,
                }
            ]
        },
        headers={"Origin": settings.frontend_origin},
    )
    assert invalid_segment.status_code == 422
