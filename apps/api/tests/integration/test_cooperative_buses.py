from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import BusGroup
from app.modules.cooperatives.models import Cooperative
from app.modules.staff.models import Staff, StaffPosition
from app.core.security import hash_password


PASSWORD = "ClaveCooperativa123!"
BUSES_URL = "/api/v1/cooperatives/me/buses"


def create_cooperative(engine, *, name: str, email: str) -> Cooperative:
    with Session(engine) as db:
        cooperative = Cooperative(
            name=name,
            ruc=f"179{sum(ord(character) for character in email):010d}",
        )
        db.add(cooperative)
        db.flush()
        db.add(
            Account(
                email=email,
                password_hash=hash_password(PASSWORD),
                account_type=AccountType.COOPERATIVE,
                cooperative_id=cooperative.id,
            )
        )
        db.commit()
        db.refresh(cooperative)
        return cooperative


def login(client, email: str):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"Origin": settings.frontend_origin},
    )


def create_group(engine, cooperative_id: int, name: str) -> int:
    with Session(engine) as db:
        group = BusGroup(cooperative_id=cooperative_id, name=name, description=None)
        db.add(group)
        db.commit()
        return group.id


def bus_payload(group_id: int, **changes):
    payload = {
        "plate": "ABC-1234",
        "brand": "Hino",
        "model": "AK",
        "year": 2024,
        "capacity": 42,
        "floors": 2,
        "origin": "nacional",
        "status": "operativo",
        "groupId": group_id,
    }
    payload.update(changes)
    return payload


def test_cooperative_can_create_filter_update_status_and_delete_bus(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative(engine, name="Flota", email="flota-bus@example.com")
    group_id = create_group(engine, cooperative.id, "Interprovinciales")
    assert login(client, "flota-bus@example.com").status_code == 200

    created = client.post(
        BUSES_URL,
        json=bus_payload(group_id),
        headers={"Origin": settings.frontend_origin},
    )
    assert created.status_code == 201
    assert created.json()["floors"] == 2
    assert created.json()["groupId"] == group_id

    assert client.get(f"{BUSES_URL}?plate=abc").json()[0]["plate"] == "ABC-1234"
    updated = client.patch(
        f"{BUSES_URL}/{created.json()['id']}",
        json={"model": "AK-2024", "status": "mantenimiento"},
        headers={"Origin": settings.frontend_origin},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "mantenimiento"

    removed = client.delete(
        f"{BUSES_URL}/{created.json()['id']}",
        headers={"Origin": settings.frontend_origin},
    )
    assert removed.status_code == 204
    assert client.get(BUSES_URL).json() == []


def test_bus_plates_are_unique_and_groups_are_tenant_scoped(test_environment):
    client, engine = test_environment
    first = create_cooperative(engine, name="Primera", email="primera-bus@example.com")
    second = create_cooperative(engine, name="Segunda", email="segunda-bus@example.com")
    first_group = create_group(engine, first.id, "Propio")
    second_group = create_group(engine, second.id, "Ajeno")

    assert login(client, "primera-bus@example.com").status_code == 200
    assert client.post(
        BUSES_URL,
        json=bus_payload(first_group),
        headers={"Origin": settings.frontend_origin},
    ).status_code == 201
    assert client.post(
        BUSES_URL,
        json=bus_payload(first_group, plate="ABC-1234"),
        headers={"Origin": settings.frontend_origin},
    ).status_code == 409
    assert client.post(
        BUSES_URL,
        json=bus_payload(second_group, plate="XYZ-9999"),
        headers={"Origin": settings.frontend_origin},
    ).status_code == 404

    assert login(client, "segunda-bus@example.com").status_code == 200
    assert client.get(BUSES_URL).json() == []


def test_bus_validation_rejects_invalid_values(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative(
        engine, name="Validación", email="validacion-bus@example.com"
    )
    group_id = create_group(engine, cooperative.id, "Validos")
    assert login(client, "validacion-bus@example.com").status_code == 200

    invalid = bus_payload(group_id, capacity=0, floors=1, origin="desconocido")
    response = client.post(
        BUSES_URL,
        json=invalid,
        headers={"Origin": settings.frontend_origin},
    )
    assert response.status_code == 422


def test_bus_with_staff_assignment_cannot_be_deleted(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative(
        engine, name="Protección", email="proteccion-bus@example.com"
    )
    group_id = create_group(engine, cooperative.id, "Operativos")
    assert login(client, "proteccion-bus@example.com").status_code == 200
    created = client.post(
        BUSES_URL,
        json=bus_payload(group_id, plate="PRO-0001"),
        headers={"Origin": settings.frontend_origin},
    )
    assert created.status_code == 201

    with Session(engine) as db:
        db.add(
            Staff(
                cooperative_id=cooperative.id,
                account_id=db.scalar(
                    select(Account.id).where(
                        Account.email == "proteccion-bus@example.com"
                    )
                ),
                first_name="Chofer",
                last_name="Asignado",
                id_number="1712345678",
                position=StaffPosition.DRIVER,
                assigned_bus_id=created.json()["id"],
            )
        )
        db.commit()

    removed = client.delete(
        f"{BUSES_URL}/{created.json()['id']}",
        headers={"Origin": settings.frontend_origin},
    )
    assert removed.status_code == 409
