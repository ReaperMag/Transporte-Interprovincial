
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.cooperatives.models import Cooperative
from app.modules.roles_permissions.seed import (
    COOPERATIVE_ADMIN_ROLE,
    ensure_default_roles,
)
from app.modules.vehicle_catalog.catalog_data import (
    BODYWORK_BRANDS,
    CHASSIS_BRANDS,
)
from app.modules.vehicle_catalog.service import ensure_vehicle_catalog


# Issue #63: consulta de catálogos globales desde Cooperativa.

CATALOG_URL = "/api/v1/cooperatives/me/vehicle-catalog"
ADMIN_CATALOG_URL = "/api/v1/admin/vehicle-catalog"

PASSWORD = "ClaveCooperativa123!"
COOPERATIVE_EMAIL = "catalogo-cooperativa@example.com"

HEADERS = {"Origin": settings.frontend_origin}


def seed_catalog(engine) -> None:
    """Prepara los catálogos globales utilizando el servicio existente."""
    with Session(engine) as db:
        ensure_vehicle_catalog(db)


def create_cooperative(engine) -> None:
    """Crea una cooperativa con un administrador autorizado."""
    with Session(engine) as db:
        cooperative = Cooperative(
            name="Cooperativa de prueba",
            ruc="1790000000001",
        )

        db.add(cooperative)
        db.flush()

        role = ensure_default_roles(db)[COOPERATIVE_ADMIN_ROLE]

        account = Account(
            email=COOPERATIVE_EMAIL,
            password_hash=hash_password(PASSWORD),
            account_type=AccountType.COOPERATIVE,
            cooperative_id=cooperative.id,
            role_id=role.id,
        )

        db.add(account)
        db.commit()


def login_as_cooperative(client) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": COOPERATIVE_EMAIL,
            "password": PASSWORD,
        },
        headers=HEADERS,
    )

    assert response.status_code == 200, response.text


def test_cooperative_can_read_global_vehicle_catalog(
    test_environment,
) -> None:
    client, engine = test_environment

    seed_catalog(engine)
    create_cooperative(engine)
    login_as_cooperative(client)

    response = client.get(CATALOG_URL)

    assert response.status_code == 200, response.text

    catalog = response.json()

    assert "chassis" in catalog
    assert "bodyworks" in catalog
    assert "bodyworkLocations" in catalog

    chassis_names = {
        item["name"] for item in catalog["chassis"]
    }

    bodywork_names = {
        item["name"] for item in catalog["bodyworks"]
    }

    assert chassis_names >= set(CHASSIS_BRANDS)
    assert bodywork_names >= set(BODYWORK_BRANDS)

    for item in catalog["chassis"]:
        assert isinstance(item["id"], int)
        assert isinstance(item["name"], str)

    for item in catalog["bodyworks"]:
        assert isinstance(item["id"], int)
        assert isinstance(item["name"], str)


def test_anonymous_user_cannot_read_cooperative_catalog(
    test_environment,
) -> None:
    client, _engine = test_environment

    response = client.get(CATALOG_URL)

    assert response.status_code in (401, 403)


def test_cooperative_cannot_modify_admin_catalog(
    test_environment,
) -> None:
    client, engine = test_environment

    seed_catalog(engine)
    create_cooperative(engine)
    login_as_cooperative(client)

    response = client.post(
        f"{ADMIN_CATALOG_URL}/chassis",
        json={"name": "Marca no autorizada"},
        headers=HEADERS,
    )

    assert response.status_code == 403

    # La ruta de Cooperativa es exclusivamente de lectura.
    response = client.post(
        CATALOG_URL,
        json={"name": "Marca no autorizada"},
        headers=HEADERS,
    )

    assert response.status_code == 405


def test_super_admin_cannot_access_cooperative_only_catalog(
    test_environment,
) -> None:
    client, engine = test_environment

    seed_catalog(engine)

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "bootstrap-admin@example.com",
            "password": "TestBootstrapAdmin123!",
        },
        headers=HEADERS,
    )

    assert response.status_code == 200, response.text

    response = client.get(CATALOG_URL)

    assert response.status_code == 403
