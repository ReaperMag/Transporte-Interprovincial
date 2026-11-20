"""Pruebas de edición y copia segura de plantillas - issue #66."""

from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import (
    Bus,
    BusOrigin,
    BusStatus,
    BusTemplate,
    CooperativeSeatType,
    SeatType,
    TemplateSeat,
)
from app.modules.cooperatives.models import Cooperative
from app.modules.roles_permissions.seed import (
    COOPERATIVE_ADMIN_ROLE,
    ensure_default_roles,
)

URL = "/api/v1/cooperatives/me/buses/templates"
HEADERS = {"Origin": settings.frontend_origin}
PASSWORD = "ClaveCooperativa123!"


def prepare_cooperative(client, engine, email: str) -> int:
    with Session(engine) as db:
        cooperative = Cooperative(
            name=f"Cooperativa {email}",
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

        cooperative_id = cooperative.id
        db.commit()

    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text

    return cooperative_id


def create_template(engine, cooperative_id: int) -> int:
    with Session(engine) as db:
        template = BusTemplate(
            cooperative_id=cooperative_id,
            name="Plantilla original",
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

        template_id = template.id
        db.commit()
        return template_id


def associate_bus(
    engine,
    cooperative_id: int,
    template_id: int,
) -> int:
    with Session(engine) as db:
        bus = Bus(
            cooperative_id=cooperative_id,
            number="101",
            plate="TPL-1234",
            chassis_brand="Hino",
            body_brand="Carrocería ejemplo",
            brand="Hino",
            model="AK",
            year=2024,
            passenger_capacity=40,
            floors=1,
            origin=BusOrigin.NATIONAL,
            status=BusStatus.OPERATIONAL,
            template_id=template_id,
        )

        db.add(bus)
        db.flush()

        bus_id = bus.id
        db.commit()

        return bus_id


def updated_layout() -> dict:
    return {
        "name": "Plantilla editada",
        "floors": 1,
        "hasBathroom": True,
        "rows": 2,
        "columns": 4,
        "seats": [
            {
                "number": 1,
                "floor": 1,
                "row": 1,
                "column": 2,
                "seatType": "normal",
            },
            {
                "number": 2,
                "floor": 1,
                "row": 1,
                "column": 4,
                "seatType": "vip",
            },
        ],
    }


def test_free_template_is_updated_without_copy(test_environment):
    client, engine = test_environment

    cooperative_id = prepare_cooperative(
        client, engine, "free-66@example.com"
    )
    template_id = create_template(engine, cooperative_id)

    response = client.put(
        f"{URL}/{template_id}",
        json=updated_layout(),
        headers=HEADERS,
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["copied"] is False
    assert data["sourceTemplateId"] == template_id
    assert data["template"]["id"] == template_id
    assert len(data["template"]["seats"]) == 2

    with Session(engine) as db:
        stored = db.get(BusTemplate, template_id)

        assert stored.name == "Plantilla editada"
        assert [
            (seat.number, seat.column)
            for seat in stored.seats
        ] == [(1, 2), (2, 4)]

        assert len(
            db.scalars(select(BusTemplate)).all()
        ) == 1


def test_used_template_creates_copy_without_touching_original_bus(
    test_environment,
):
    client, engine = test_environment

    cooperative_id = prepare_cooperative(
        client, engine, "used-66@example.com"
    )
    template_id = create_template(engine, cooperative_id)
    bus_id = associate_bus(engine, cooperative_id, template_id)

    response = client.put(
        f"{URL}/{template_id}",
        json=updated_layout(),
        headers=HEADERS,
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["copied"] is True
    assert data["sourceTemplateId"] == template_id

    copy_id = data["template"]["id"]

    assert copy_id != template_id
    assert data["template"]["busCount"] == 0
    assert len(data["template"]["seats"]) == 2

    with Session(engine) as db:
        original = db.get(BusTemplate, template_id)
        new_copy = db.get(BusTemplate, copy_id)
        bus = db.get(Bus, bus_id)

        # La plantilla original debe mantenerse intacta.
        assert original.name == "Plantilla original"
        assert original.has_bathroom is False

        assert [
            (seat.number, seat.column)
            for seat in original.seats
        ] == [(1, 1)]

        # La copia contiene la distribución modificada.
        assert new_copy.name.endswith(" (copia)")

        assert [
            (seat.number, seat.column)
            for seat in new_copy.seats
        ] == [(1, 2), (2, 4)]

        # El bus debe seguir usando la plantilla original.
        assert bus.template_id == template_id

    response = client.get(URL)

    assert response.status_code == 200, response.text

    counts = {
        item["id"]: item["busCount"]
        for item in response.json()
    }

    assert counts[template_id] == 1
    assert counts[copy_id] == 0


def test_other_cooperative_cannot_edit_template(
    test_environment,
):
    client, engine = test_environment

    owner_id = prepare_cooperative(
        client, engine, "owner-66@example.com"
    )
    template_id = create_template(engine, owner_id)

    prepare_cooperative(
        client, engine, "other-66@example.com"
    )

    response = client.put(
        f"{URL}/{template_id}",
        json=updated_layout(),
        headers=HEADERS,
    )

    assert response.status_code == 404, response.text

    with Session(engine) as db:
        assert (
            db.get(BusTemplate, template_id).name
            == "Plantilla original"
        )


@pytest.mark.parametrize(
    "problem",
    [
        "duplicate_number",
        "duplicate_position",
        "wrong_floor",
        "empty",
    ],
)
def test_invalid_layout_is_rejected(
    test_environment,
    problem,
):
    client, engine = test_environment

    cooperative_id = prepare_cooperative(
        client, engine, "invalid-66@example.com"
    )
    template_id = create_template(engine, cooperative_id)

    payload = updated_layout()

    if problem == "duplicate_number":
        payload["seats"][1]["number"] = 1

    elif problem == "duplicate_position":
        payload["seats"][1]["column"] = 2

    elif problem == "wrong_floor":
        payload["seats"][1]["floor"] = 2

    else:
        payload["seats"] = []

    response = client.put(
        f"{URL}/{template_id}",
        json=payload,
        headers=HEADERS,
    )

    assert response.status_code == 422, response.text

    with Session(engine) as db:
        assert (
            db.get(BusTemplate, template_id).name
            == "Plantilla original"
        )


def test_cannot_assign_seat_type_of_other_cooperative(
    test_environment,
):
    client, engine = test_environment

    own_id = prepare_cooperative(
        client, engine, "own-66@example.com"
    )
    template_id = create_template(engine, own_id)

    other_id = prepare_cooperative(
        client, engine, "foreign-66@example.com"
    )

    with Session(engine) as db:
        foreign_type = CooperativeSeatType(
            cooperative_id=other_id,
            name="Ejecutivo",
            percentage=Decimal("15.00"),
        )

        db.add(foreign_type)
        db.flush()

        foreign_id = foreign_type.id
        db.commit()

    # Volver a iniciar sesión como propietario.
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "own-66@example.com",
            "password": PASSWORD,
        },
        headers=HEADERS,
    )

    assert response.status_code == 200, response.text

    payload = updated_layout()
    payload["seats"][0]["seatTypeId"] = foreign_id

    response = client.put(
        f"{URL}/{template_id}",
        json=payload,
        headers=HEADERS,
    )

    assert response.status_code == 404, response.text

    with Session(engine) as db:
        assert (
            db.get(BusTemplate, template_id).name
            == "Plantilla original"
        )


def test_own_seat_type_is_saved(test_environment):
    client, engine = test_environment

    cooperative_id = prepare_cooperative(
        client, engine, "mytype-66@example.com"
    )
    template_id = create_template(engine, cooperative_id)

    with Session(engine) as db:
        own_type = CooperativeSeatType(
            cooperative_id=cooperative_id,
            name="Ejecutivo",
            percentage=Decimal("12.50"),
        )

        db.add(own_type)
        db.flush()

        own_id = own_type.id
        db.commit()

    payload = updated_layout()
    payload["seats"][0]["seatTypeId"] = own_id

    response = client.put(
        f"{URL}/{template_id}",
        json=payload,
        headers=HEADERS,
    )

    assert response.status_code == 200, response.text

    assert (
        response.json()["template"]["seats"][0]["seatTypeId"]
        == own_id
    )
