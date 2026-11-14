
from decimal import Decimal

from sqlalchemy.orm import Session
from sqlalchemy import select
from app.modules.buses.models import BusGroup, BusTemplate, TemplateSeat

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.cooperatives.models import Cooperative
from app.modules.roles_permissions.seed import (
    COOPERATIVE_ADMIN_ROLE,
    ensure_default_roles,
)


PASSWORD = "ClaveCooperativa123!"
SEAT_TYPES_URL = "/api/v1/cooperatives/me/seat-types"
HEADERS = {"Origin": settings.frontend_origin}


def create_cooperative(engine, name: str, email: str):
    with Session(engine) as db:
        cooperative = Cooperative(
            name=name,
            ruc=f"179{sum(ord(char) for char in email):010d}",
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

        db.commit()
        db.refresh(cooperative)
        return cooperative


def login(client, email: str):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text


def test_create_and_list_seat_types(test_environment):
    client, engine = test_environment

    create_cooperative(
        engine, "Cooperativa A", "asientos-a@example.com"
    )
    login(client, "asientos-a@example.com")

    normal = client.post(
        SEAT_TYPES_URL,
        json={"name": "Normal", "percentage": 0},
        headers=HEADERS,
    )
    assert normal.status_code == 201, normal.text
    assert normal.json()["name"] == "Normal"

    vip = client.post(
        SEAT_TYPES_URL,
        json={"name": "VIP", "percentage": 10},
        headers=HEADERS,
    )
    assert vip.status_code == 201, vip.text

    response = client.get(SEAT_TYPES_URL)

    assert response.status_code == 200
    assert len(response.json()) == 2

    names = {item["name"] for item in response.json()}
    assert names == {"Normal", "VIP"}


def test_update_seat_type(test_environment):
    client, engine = test_environment

    create_cooperative(
        engine, "Cooperativa B", "asientos-b@example.com"
    )
    login(client, "asientos-b@example.com")

    created = client.post(
        SEAT_TYPES_URL,
        json={"name": "VIP", "percentage": 10},
        headers=HEADERS,
    )
    assert created.status_code == 201, created.text
    seat_type_id = created.json()["id"]

    updated = client.patch(
        f"{SEAT_TYPES_URL}/{seat_type_id}",
        json={"name": "Ejecutivo", "percentage": 15},
        headers=HEADERS,
    )

    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Ejecutivo"
    assert Decimal(str(updated.json()["percentage"])) == Decimal("15")

    consulted = client.get(
        f"{SEAT_TYPES_URL}/{seat_type_id}"
    )
    assert consulted.status_code == 200
    assert consulted.json()["name"] == "Ejecutivo"


def test_duplicate_name_and_invalid_percentage(test_environment):
    client, engine = test_environment

    create_cooperative(
        engine, "Cooperativa C", "asientos-c@example.com"
    )
    login(client, "asientos-c@example.com")

    created = client.post(
        SEAT_TYPES_URL,
        json={"name": "VIP", "percentage": 10},
        headers=HEADERS,
    )
    assert created.status_code == 201, created.text

    duplicate = client.post(
        SEAT_TYPES_URL,
        json={"name": " vip ", "percentage": 20},
        headers=HEADERS,
    )
    assert duplicate.status_code == 409

    invalid = client.post(
        SEAT_TYPES_URL,
        json={"name": "Especial", "percentage": -5},
        headers=HEADERS,
    )
    assert invalid.status_code == 422

    invalid_update = client.patch(
        f"{SEAT_TYPES_URL}/{created.json()['id']}",
        json={"percentage": -1},
        headers=HEADERS,
    )
    assert invalid_update.status_code == 422


def test_cooperatives_cannot_access_other_seat_types(
    test_environment,
):
    client, engine = test_environment

    create_cooperative(
        engine, "Cooperativa D", "asientos-d@example.com"
    )
    create_cooperative(
        engine, "Cooperativa E", "asientos-e@example.com"
    )

    login(client, "asientos-d@example.com")

    created = client.post(
        SEAT_TYPES_URL,
        json={"name": "VIP", "percentage": 10},
        headers=HEADERS,
    )
    assert created.status_code == 201, created.text
    seat_type_id = created.json()["id"]

    login(client, "asientos-e@example.com")

    listing = client.get(SEAT_TYPES_URL)
    assert listing.status_code == 200
    assert listing.json() == []

    consulted = client.get(
        f"{SEAT_TYPES_URL}/{seat_type_id}"
    )
    assert consulted.status_code == 404

    modified = client.patch(
        f"{SEAT_TYPES_URL}/{seat_type_id}",
        json={"percentage": 50},
        headers=HEADERS,
    )
    assert modified.status_code == 404


def test_bus_uses_own_seat_type_and_rejects_foreign_type(
    test_environment,
):
    client, engine = test_environment

    cooperative_a = create_cooperative(
        engine, "Cooperativa A", "seat-bus-a@example.com"
    )
    cooperative_b = create_cooperative(
        engine, "Cooperativa B", "seat-bus-b@example.com"
    )

    # Crear un grupo para cada cooperativa.
    with Session(engine) as db:
        group_a = BusGroup(
            cooperative_id=cooperative_a.id,
            name="Interprovincial",
            description=None,
        )
        group_b = BusGroup(
            cooperative_id=cooperative_b.id,
            name="Interprovincial",
            description=None,
        )
        db.add_all([group_a, group_b])
        db.commit()
        group_a_id = group_a.id
        group_b_id = group_b.id

    # Cooperativa A registra su tipo de asiento.
    login(client, "seat-bus-a@example.com")

    created_type = client.post(
        SEAT_TYPES_URL,
        json={"name": "Ejecutivo", "percentage": 15},
        headers=HEADERS,
    )

    assert created_type.status_code == 201, created_type.text
    seat_type_id = created_type.json()["id"]

    # Preparar un bus con un asiento de tipo Ejecutivo.
    payload = {
        "number": "025",
        "plate": "ABC-1234",
        "brand": "Hino",
        "model": "AK",
        "year": 2024,
        "capacity": 1,
        "floors": 2,
        "origin": "nacional",
        "status": "operativo",
        "groupId": group_a_id,
        "template": {
            "name": "Plantilla Ejecutivo",
            "floors": 2,
            "hasBathroom": False,
            "rows": 1,
            "columns": 2,
            "seats": [
                {
                    "number": 1,
                    "floor": 1,
                    "row": 1,
                    "column": 1,
                    "seatTypeId": seat_type_id,
                }
            ],
        },
    }

    # La cooperativa propietaria puede registrar el bus.
    created_bus = client.post(
        "/api/v1/cooperatives/me/buses",
        json=payload,
        headers=HEADERS,
    )

    assert created_bus.status_code == 201, created_bus.text
    # Consultar las plantillas después de crear el bus.
    templates_response = client.get(
        "/api/v1/cooperatives/me/buses/templates"
    )

    assert templates_response.status_code == 200

    # Buscar la plantilla utilizada por el bus creado.
    template_data = next(
        template
        for template in templates_response.json()
        if template["id"] == created_bus.json()["templateId"]
    )

    # Comprobar que la API devuelve el tipo configurable.
    assert len(template_data["seats"]) == 1
    assert template_data["seats"][0]["seatTypeId"] == seat_type_id

    # Comprobar que el ID se guardó en la base de datos.
    with Session(engine) as db:
        seat = db.scalar(
            select(TemplateSeat).where(
                TemplateSeat.template_id
                == created_bus.json()["templateId"]
            )
        )

        assert seat is not None
        assert seat.seat_type_id == seat_type_id

    # La cooperativa B no puede utilizar ese mismo tipo.
    login(client, "seat-bus-b@example.com")

    foreign_payload = {
        **payload,
        "number": "026",
        "plate": "ABC-5678",
        "groupId": group_b_id,
    }

    forbidden = client.post(
        "/api/v1/cooperatives/me/buses",
        json=foreign_payload,
        headers=HEADERS,
    )

    assert forbidden.status_code == 404, forbidden.text


def test_delete_unused_seat_type(test_environment):
    client, engine = test_environment

    create_cooperative(
        engine,
        "Cooperativa Eliminacion",
        "delete-seat@example.com",
    )

    login(client, "delete-seat@example.com")

    # Registrar un tipo de asiento.
    created = client.post(
        SEAT_TYPES_URL,
        json={"name": "Ejecutivo", "percentage": 15},
        headers=HEADERS,
    )

    assert created.status_code == 201, created.text
    seat_type_id = created.json()["id"]

    # Eliminar el tipo que no esta en uso.
    deleted = client.delete(
        f"{SEAT_TYPES_URL}/{seat_type_id}",
        headers=HEADERS,
    )

    assert deleted.status_code == 204, deleted.text

    # Comprobar que ya no existe.
    consulted = client.get(
        f"{SEAT_TYPES_URL}/{seat_type_id}"
    )

    assert consulted.status_code == 404

    # Comprobar que desaparecio del listado.
    listing = client.get(SEAT_TYPES_URL)

    assert listing.status_code == 200
    assert listing.json() == []


def test_cannot_delete_seat_type_in_use(test_environment):
    client, engine = test_environment

    cooperative_a = create_cooperative(
        engine,
        "Cooperativa Propietaria",
        "owner-seat@example.com",
    )

    create_cooperative(
        engine,
        "Cooperativa Externa",
        "other-seat@example.com",
    )

    login(client, "owner-seat@example.com")

    # Registrar el tipo VIP.
    created = client.post(
        SEAT_TYPES_URL,
        json={"name": "VIP", "percentage": 10},
        headers=HEADERS,
    )

    assert created.status_code == 201, created.text
    seat_type_id = created.json()["id"]

    # Crear una plantilla que utiliza ese tipo.
    with Session(engine) as db:
        template = BusTemplate(
            cooperative_id=cooperative_a.id,
            name="Plantilla VIP",
            floors=2,
            has_bathroom=False,
            rows=1,
            columns=2,
        )

        db.add(template)
        db.flush()

        seat = TemplateSeat(
            template_id=template.id,
            number=1,
            floor=1,
            row=1,
            column=1,
            seat_type_id=seat_type_id,
        )

        db.add(seat)
        db.commit()

    # Intentar eliminar un tipo utilizado.
    deleted = client.delete(
        f"{SEAT_TYPES_URL}/{seat_type_id}",
        headers=HEADERS,
    )

    assert deleted.status_code == 409, deleted.text

    # El tipo debe seguir existiendo.
    consulted = client.get(
        f"{SEAT_TYPES_URL}/{seat_type_id}"
    )

    assert consulted.status_code == 200
    assert consulted.json()["name"] == "VIP"

    # Otra cooperativa no puede eliminarlo.
    login(client, "other-seat@example.com")

    forbidden = client.delete(
        f"{SEAT_TYPES_URL}/{seat_type_id}",
        headers=HEADERS,
    )

    assert forbidden.status_code == 404
