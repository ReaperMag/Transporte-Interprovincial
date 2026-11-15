from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.vehicle_catalog.catalog_data import (
    BODYWORK_BRANDS,
    BODYWORK_LOCATIONS,
    BODYWORK_PROVINCE_CAPITALS,
    CHASSIS_BRANDS,
    CHASSIS_ORIGIN_COUNTRIES,
)
from app.modules.vehicle_catalog.service import ensure_vehicle_catalog


CATALOG_URL = "/api/v1/admin/vehicle-catalog"
ADMIN_EMAIL = "bootstrap-admin@example.com"
ADMIN_PASSWORD = "TestBootstrapAdmin123!"


def seed_catalog(engine) -> None:
    with Session(engine) as db:
        ensure_vehicle_catalog(db)


def login_as_admin(client) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Origin": settings.frontend_origin},
    )
    assert response.status_code == 200


def test_admin_catalog_includes_preloaded_brands_and_geographic_metadata(test_environment):
    client, engine = test_environment
    seed_catalog(engine)
    login_as_admin(client)

    response = client.get(CATALOG_URL)

    assert response.status_code == 200
    catalog = response.json()
    assert {item["name"] for item in catalog["chassis"]} >= set(CHASSIS_BRANDS)
    assert {item["name"] for item in catalog["bodyworks"]} >= set(BODYWORK_BRANDS)
    assert {
        item["name"]: item["originCountry"]
        for item in catalog["chassis"]
        if item["name"] in CHASSIS_ORIGIN_COUNTRIES
    } == CHASSIS_ORIGIN_COUNTRIES
    assert {
        item["name"]: item["location"]
        for item in catalog["bodyworks"]
        if item["name"] in BODYWORK_LOCATIONS
    } == BODYWORK_LOCATIONS
    assert set(catalog["bodyworkLocations"]) == set(BODYWORK_PROVINCE_CAPITALS.values())


def test_new_chassis_country_is_returned_as_catalogued_metadata(test_environment):
    client, engine = test_environment
    seed_catalog(engine)
    login_as_admin(client)
    headers = {"Origin": settings.frontend_origin}

    create_response = client.post(
        f"{CATALOG_URL}/chassis",
        json={"name": "Marca de prueba", "originCountry": "País de prueba"},
        headers=headers,
    )

    assert create_response.status_code == 201
    assert create_response.json()["originCountry"] == "País de prueba"
    catalog_response = client.get(CATALOG_URL)
    assert catalog_response.status_code == 200
    assert any(
        item["name"] == "Marca de prueba" and item["originCountry"] == "País de prueba"
        for item in catalog_response.json()["chassis"]
    )


def test_admin_can_create_bodywork_at_a_provincial_capital(test_environment):
    client, engine = test_environment
    seed_catalog(engine)
    login_as_admin(client)

    response = client.post(
        f"{CATALOG_URL}/bodyworks",
        json={"name": "Carrocería de prueba", "location": "Guaranda"},
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 201
    assert response.json()["location"] == "Guaranda"
