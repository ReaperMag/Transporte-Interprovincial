from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.routes.geographic_service import ensure_geographic_catalog
from sqlalchemy.orm import Session


CATALOG_URL = "/api/v1/geographic-catalog"
ADMIN_CATALOG_URL = "/api/v1/admin/geographic-catalog"
ADMIN_EMAIL = "bootstrap-admin@example.com"
ADMIN_PASSWORD = "TestBootstrapAdmin123!"
PASSENGER_EMAIL = "geography-passenger@example.com"
PASSENGER_PASSWORD = "PassengerGeography123!"


def seed_catalog(engine) -> None:
    with Session(engine) as db:
        ensure_geographic_catalog(db)


def login_as_admin(client) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Origin": settings.frontend_origin},
    )
    assert response.status_code == 200


def test_authenticated_user_can_list_all_preloaded_provinces_and_cantons(test_environment):
    client, engine = test_environment
    seed_catalog(engine)
    login_as_admin(client)

    response = client.get(CATALOG_URL)

    assert response.status_code == 200
    catalog = response.json()
    assert len(catalog["provinces"]) == 24
    assert len(catalog["cantons"]) == 223
    assert len(
        {
            (canton["province"].casefold(), canton["name"].casefold())
            for canton in catalog["cantons"]
        }
    ) == 223
    assert {
        (canton["name"], canton["province"])
        for canton in catalog["cantons"]
    } >= {
        ("Borbón", "Esmeraldas"),
        ("Sevilla Don Bosco", "Morona Santiago"),
        ("La Concordia", "Santo Domingo de los Tsáchilas"),
    }
    with Session(engine) as db:
        assert ensure_geographic_catalog(db) == 0


def test_admin_can_add_a_canton_to_an_existing_province(test_environment):
    client, engine = test_environment
    seed_catalog(engine)
    login_as_admin(client)
    payload = {"name": "24 de Mayo Norte", "province": "Pichincha"}

    response = client.post(
        f"{ADMIN_CATALOG_URL}/cantons",
        json=payload,
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 201
    assert response.json()["name"] == payload["name"]
    assert response.json()["province"] == payload["province"]
    catalog_response = client.get(CATALOG_URL)
    assert catalog_response.status_code == 200
    assert len(catalog_response.json()["cantons"]) == 224


def test_canton_creation_requires_admin_and_valid_catalog_values(test_environment):
    client, engine = test_environment
    seed_catalog(engine)
    login_as_admin(client)
    headers = {"Origin": settings.frontend_origin}

    unknown_province = client.post(
        f"{ADMIN_CATALOG_URL}/cantons",
        json={"name": "Nuevo Cantón", "province": "Provincia Inventada"},
        headers=headers,
    )
    assert unknown_province.status_code == 422

    duplicate = client.post(
        f"{ADMIN_CATALOG_URL}/cantons",
        json={"name": "Cuenca", "province": "Azuay"},
        headers=headers,
    )
    assert duplicate.status_code == 409


def test_passenger_can_read_but_cannot_modify_the_shared_catalog(test_environment):
    client, engine = test_environment
    seed_catalog(engine)
    with Session(engine) as db:
        db.add(
            Account(
                email=PASSENGER_EMAIL,
                password_hash=hash_password(PASSENGER_PASSWORD),
                account_type=AccountType.PASSENGER,
            )
        )
        db.commit()

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": PASSENGER_EMAIL, "password": PASSENGER_PASSWORD},
        headers={"Origin": settings.frontend_origin},
    )
    assert login_response.status_code == 200

    read_response = client.get(CATALOG_URL)
    assert read_response.status_code == 200
    assert len(read_response.json()["provinces"]) == 24

    write_response = client.post(
        f"{ADMIN_CATALOG_URL}/cantons",
        json={"name": "Cantón de Prueba", "province": "Pichincha"},
        headers={"Origin": settings.frontend_origin},
    )
    assert write_response.status_code == 403


def test_geographic_catalog_requires_authentication(test_environment):
    client, _ = test_environment

    response = client.get(CATALOG_URL)

    assert response.status_code == 401
