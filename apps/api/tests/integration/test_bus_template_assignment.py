"""Pruebas de la edición contextual de la plantilla de un bus - Issue #66."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import (
    Bus,
    BusOrigin,
    BusStatus,
    BusTemplate,
    SeatType,
    TemplateSeat,
)
from app.modules.cooperatives.models import Cooperative
from app.modules.roles_permissions.seed import COOPERATIVE_ADMIN_ROLE, ensure_default_roles

URL = "/api/v1/cooperatives/me/buses"
HEADERS = {"Origin": settings.frontend_origin}
PASSWORD = "ClaveCooperativa123!"


def setup_bus(client, engine, email="asignacion66@example.com"):
    with Session(engine) as db:
        cooperative = Cooperative(
        name=f"Cooperativa edición contextual {email}",
        ruc=f"179{sum(map(ord, email)):010d}",
        )

        db.add(cooperative)
        db.flush()
        role = ensure_default_roles(db)[COOPERATIVE_ADMIN_ROLE]
        db.add(
            Account(
                email=email,
                password_hash=hash_password(PASSWORD),
                account_type=AccountType.COOPERATIVE,
                cooperative_id=cooperative.id,
                role_id=role.id,
            )
        )
        template = BusTemplate(
            cooperative_id=cooperative.id,
            name="Plano original",
            floors=1,
            has_bathroom=False,
            rows=2,
            columns=4,
        )
        db.add(template)
        db.flush()
        db.add(
            TemplateSeat(
                template_id=template.id,
                number=1,
                floor=1,
                row=1,
                column=1,
                seat_type=SeatType.NORMAL,
            )
        )
        bus = Bus(
            cooperative_id=cooperative.id,
            number="207",
            plate="ABC-2070" if email == "asignacion66@example.com" else "XYZ-2070",
            chassis_brand="Hino",
            body_brand="Cayambe",
            brand="Hino",
            model="AK",
            year=2026,
            passenger_capacity=40,
            floors=1,
            origin=BusOrigin.NATIONAL,
            status=BusStatus.MAINTENANCE,
            template_id=template.id,
        )
        db.add(bus)
        db.flush()
        ids = (cooperative.id, bus.id, template.id)
        db.commit()

    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    return ids


def layout(name="Plano original", column=1):
    return {
        "name": name,
        "floors": 1,
        "hasBathroom": False,
        "rows": 2,
        "columns": 4,
        "seats": [
            {
                "number": 1,
                "floor": 1,
                "row": 1,
                "column": column,
                "seatType": "normal",
            }
        ],
    }


def test_edit_bus_assigns_copy_and_preserves_original(test_environment):
    client, engine = test_environment
    _, bus_id, template_id = setup_bus(client, engine)
    response = client.put(
        f"{URL}/{bus_id}/template",
        json={"capacity": 30, "template": layout("Plano editado", column=2)},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["copied"] is True
    assert result["busId"] == bus_id
    assert result["sourceTemplateId"] == template_id
    assert result["busTemplateId"] != template_id
    assert result["capacity"] == 30

    with Session(engine) as db:
        bus = db.get(Bus, bus_id)
        original = db.get(BusTemplate, template_id)
        copied = db.get(BusTemplate, result["busTemplateId"])
        assert bus.template_id == copied.id
        assert bus.passenger_capacity == 30
        assert original.name == "Plano original"
        assert [(seat.number, seat.column) for seat in original.seats] == [(1, 1)]
        assert [(seat.number, seat.column) for seat in copied.seats] == [(1, 2)]


def test_only_capacity_update_does_not_create_copy(test_environment):
    client, engine = test_environment
    _, bus_id, template_id = setup_bus(client, engine)
    response = client.put(
        f"{URL}/{bus_id}/template",
        json={"capacity": 50, "template": layout()},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    assert response.json()["copied"] is False
    assert response.json()["busTemplateId"] == template_id
    with Session(engine) as db:
        assert db.get(Bus, bus_id).passenger_capacity == 50
        assert db.scalar(select(func.count(BusTemplate.id))) == 1


def test_capacity_error_does_not_modify_bus_or_copy(test_environment):
    client, engine = test_environment
    _, bus_id, template_id = setup_bus(client, engine)
    response = client.put(
        f"{URL}/{bus_id}/template",
        json={"capacity": 1, "template": {**layout("Nuevo"), "seats": [
            {"number": 1, "floor": 1, "row": 1, "column": 1},
            {"number": 2, "floor": 1, "row": 1, "column": 2},
        ]}},
        headers=HEADERS,
    )
    assert response.status_code == 422, response.text
    with Session(engine) as db:
        assert db.get(Bus, bus_id).template_id == template_id
        assert db.get(Bus, bus_id).passenger_capacity == 40
        assert db.scalar(select(func.count(BusTemplate.id))) == 1


def test_other_cooperative_cannot_edit_bus_template(test_environment):
    client, engine = test_environment
    _, bus_id, template_id = setup_bus(client, engine)
    setup_bus(client, engine, email="segunda66@example.com")
    response = client.put(
        f"{URL}/{bus_id}/template",
        json={"capacity": 40, "template": layout("Intruso", column=2)},
        headers=HEADERS,
    )
    assert response.status_code == 404, response.text
    with Session(engine) as db:
        assert db.get(Bus, bus_id).template_id == template_id


def test_invalid_seat_type_does_not_assign_a_copy(test_environment):
    client, engine = test_environment
    _, bus_id, template_id = setup_bus(client, engine)
    changed = layout("Copia inválida", column=2)
    changed["seats"][0]["seatTypeId"] = 999999
    response = client.put(
        f"{URL}/{bus_id}/template",
        json={"capacity": 40, "template": changed},
        headers=HEADERS,
    )
    assert response.status_code == 404, response.text
    with Session(engine) as db:
        assert db.get(Bus, bus_id).template_id == template_id
        assert db.scalar(select(func.count(BusTemplate.id))) == 1


def test_operational_bus_rejects_layout_edit(test_environment):
    client, engine = test_environment
    _, bus_id, template_id = setup_bus(client, engine)
    with Session(engine) as db:
        bus = db.get(Bus, bus_id)
        bus.status = BusStatus.OPERATIONAL
        db.commit()

    response = client.put(
        f"{URL}/{bus_id}/template",
        json={"capacity": 40, "template": layout("No permitido", column=2)},
        headers=HEADERS,
    )
    assert response.status_code == 409, response.text
    with Session(engine) as db:
        assert db.get(Bus, bus_id).template_id == template_id
        assert db.scalar(select(func.count(BusTemplate.id))) == 1


def test_out_of_service_bus_can_copy(test_environment):
    client, engine = test_environment
    _, bus_id, template_id = setup_bus(client, engine)
    with Session(engine) as db:
        bus = db.get(Bus, bus_id)
        bus.status = BusStatus.OUT_OF_SERVICE
        db.commit()

    response = client.put(
        f"{URL}/{bus_id}/template",
        json={"capacity": 40, "template": layout("Nueva distribución", column=2)},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    assert response.json()["busTemplateId"] != template_id


def create_trip_for_bus(engine, cooperative_id, bus_id, status):
    from datetime import datetime, time
    from app.modules.routes.models import City, Route, RouteType
    from app.modules.schedules.models import Frequency
    from app.modules.trips.models import Trip

    with Session(engine) as db:
        origin = City(name=f"Origen {bus_id}", province="Tungurahua")
        destination = City(name=f"Destino {bus_id}", province="Pichincha")
        db.add_all([origin, destination])
        db.flush()
        route = Route(
            cooperative_id=cooperative_id,
            origin_city_id=origin.id,
            destination_city_id=destination.id,
            route_type=RouteType.DIRECT,
            duration_minutes=180,
            is_active=True,
        )
        db.add(route)
        db.flush()
        frequency = Frequency(
            cooperative_id=cooperative_id,
            route_id=route.id,
            departure_time=time(10, 0),
            resolution_number="ANT-66",
            is_active=True,
        )
        db.add(frequency)
        db.flush()
        trip = Trip(
            cooperative_id=cooperative_id,
            frequency_id=frequency.id,
            bus_id=bus_id,
            departure_at=datetime(2026, 11, 1, 10, 0),
            status=status,
            template_id=None,  # Existing legacy trip, pre-snapshot.
        )
        db.add(trip)
        db.flush()
        trip_id=trip.id
        db.commit()
        return trip_id


def test_finished_trip_retains_original_plan(test_environment):
    from app.modules.trips.models import Trip, TripStatus
    client, engine = test_environment
    coop_id, bus_id, template_id = setup_bus(client, engine)
    trip_id = create_trip_for_bus(engine, coop_id, bus_id, TripStatus.FINISHED)

    response = client.put(
        f"{URL}/{bus_id}/template",
        json={"capacity": 40, "template": layout("Nuevo plano", column=2)},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    changed_bus_template = response.json()["busTemplateId"]
    assert changed_bus_template != template_id

    with Session(engine) as db:
        trip = db.get(Trip, trip_id)
        assert trip.template_id == template_id
        assert trip.template.id == template_id
        assert db.get(Bus, bus_id).template_id == changed_bus_template


def test_scheduled_trip_must_be_reassigned_before_plan_change(test_environment):
    from app.modules.trips.models import TripStatus
    client, engine = test_environment
    coop_id, bus_id, template_id = setup_bus(client, engine)
    create_trip_for_bus(engine, coop_id, bus_id, TripStatus.SCHEDULED)

    response = client.put(
        f"{URL}/{bus_id}/template",
        json={"capacity": 40, "template": layout("Nuevo plano", column=2)},
        headers=HEADERS,
    )
    assert response.status_code == 409, response.text
    with Session(engine) as db:
        assert db.get(Bus, bus_id).template_id == template_id
        assert db.scalar(select(func.count(BusTemplate.id))) == 1
