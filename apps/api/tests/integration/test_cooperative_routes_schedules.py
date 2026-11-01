from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import Bus, BusGroup, BusTemplate
from app.modules.cooperatives import service
from app.modules.cooperatives.models import Cooperative
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.trips.models import Trip


PASSWORD = "ClaveCooperativa123!"
PLANNING_URL = "/api/v1/cooperatives/me/route-planning"


def create_cooperative_account(engine) -> Cooperative:
    with Session(engine) as db:
        cooperative = service.create_cooperative(
            db,
            {"name": "Cooperativa Rutas", "ruc": "1791234567001"},
        )
        db.add(
            Account(
                email="rutas@example.com",
                password_hash=hash_password(PASSWORD),
                account_type=AccountType.COOPERATIVE,
                cooperative_id=cooperative.id,
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
    response = client.post(
        f"{PLANNING_URL}/cities",
        json={"name": name, "province": province},
        headers={"Origin": settings.frontend_origin},
    )
    assert response.status_code == 201
    return response.json()["id"]


def create_route(client, origin_id: int, destination_id: int, *, duration: int, stops=None):
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
    return response.json()


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