
from decimal import Decimal

from sqlalchemy.orm import Session

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
