from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import Bus, BusGroup, BusTemplate
from app.modules.cooperatives.models import Cooperative


PASSWORD = "ClaveCooperativa123!"
GROUPS_URL = "/api/v1/cooperatives/me/groups"


def create_cooperative_account(engine, *, name: str, email: str) -> Cooperative:
    with Session(engine) as db:
        cooperative_count = db.scalar(
            select(func.count()).select_from(Cooperative)
        ) or 0
        cooperative = Cooperative(
            name=name,
            ruc=str(1234567890001 + cooperative_count),
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


def test_cooperative_can_create_and_list_its_bus_groups(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(
        engine,
        name="Cooperativa Grupos",
        email="grupos@example.com",
    )
    assert login(client, "grupos@example.com").status_code == 200

    created = client.post(
        GROUPS_URL,
        json={"name": "  Rutas   largas ", "description": "Servicios interprovinciales"},
        headers={"Origin": settings.frontend_origin},
    )

    assert created.status_code == 201
    assert created.json() == {
        "id": created.json()["id"],
        "name": "Rutas largas",
        "description": "Servicios interprovinciales",
        "busCount": 0,
    }

    listed = client.get(GROUPS_URL)
    assert listed.status_code == 200
    assert listed.json() == [created.json()]

    with Session(engine) as db:
        group = db.get(BusGroup, created.json()["id"])
        assert group is not None
        assert group.cooperative_id == cooperative.id
        assert group.normalized_name == "rutas largas"


def test_bus_group_names_are_unique_per_cooperative_ignoring_case_and_spaces(
    test_environment,
):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        name="Cooperativa Nombres",
        email="nombres@example.com",
    )
    assert login(client, "nombres@example.com").status_code == 200

    first = client.post(
        GROUPS_URL,
        json={"name": "Rancheras"},
        headers={"Origin": settings.frontend_origin},
    )
    duplicate = client.post(
        GROUPS_URL,
        json={"name": "  rancheras  "},
        headers={"Origin": settings.frontend_origin},
    )

    assert first.status_code == 201
    assert duplicate.status_code == 409


def test_bus_group_listing_is_limited_to_authenticated_cooperative(test_environment):
    client, engine = test_environment
    create_cooperative_account(engine, name="Cooperativa Uno", email="uno@example.com")
    other = create_cooperative_account(
        engine,
        name="Cooperativa Dos",
        email="dos@example.com",
    )
    with Session(engine) as db:
        db.add(
            BusGroup(
                cooperative_id=other.id,
                name="Grupo ajeno",
                description=None,
            )
        )
        db.commit()

    assert client.get(GROUPS_URL).status_code == 401
    assert login(client, "uno@example.com").status_code == 200
    assert client.get(GROUPS_URL).json() == []
    assert client.post(
        GROUPS_URL,
        json={"name": "Grupo propio", "cooperativeId": other.id},
        headers={"Origin": settings.frontend_origin},
    ).status_code == 422


def test_bus_group_name_and_description_validation(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        name="Cooperativa Validación",
        email="validacion-grupos@example.com",
    )
    assert login(client, "validacion-grupos@example.com").status_code == 200

    for payload in (
        {"name": "   "},
        {"name": "x" * 101},
        {"name": "Nombre", "description": "x" * 256},
    ):
        response = client.post(
            GROUPS_URL,
            json=payload,
            headers={"Origin": settings.frontend_origin},
        )
        assert response.status_code == 422


def test_bus_group_list_reports_number_of_assigned_buses(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(
        engine,
        name="Cooperativa Flota",
        email="flota@example.com",
    )
    assert login(client, "flota@example.com").status_code == 200
    created = client.post(
        GROUPS_URL,
        json={"name": "Importados"},
        headers={"Origin": settings.frontend_origin},
    )
    assert created.status_code == 201

    with Session(engine) as db:
        template = BusTemplate(
            cooperative_id=cooperative.id,
            name="Plantilla de prueba",
            rows=2,
            columns=2,
        )
        db.add(template)
        db.flush()
        db.add(
            Bus(
                cooperative_id=cooperative.id,
                number="01",
                plate="ABC-1234",
                chassis_brand="Marca",
                body_brand="Carrocería",
                template_id=template.id,
                group_id=created.json()["id"],
            )
        )
        db.commit()

    listed = client.get(GROUPS_URL)
    assert listed.status_code == 200
    assert listed.json()[0]["busCount"] == 1
