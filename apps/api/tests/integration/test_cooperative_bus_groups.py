from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import Bus, BusGroup, BusTemplate
from app.modules.cooperatives.models import Cooperative
from app.modules.schedules.models import RouteSheet


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


def test_cooperative_can_edit_group_name_and_description(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(
        engine,
        name="Cooperativa Edición",
        email="edicion@example.com",
    )
    assert login(client, "edicion@example.com").status_code == 200
    created = client.post(
        GROUPS_URL,
        json={"name": "Rutas largas", "description": "Descripción inicial"},
        headers={"Origin": settings.frontend_origin},
    )
    group_id = created.json()["id"]

    updated = client.patch(
        f"{GROUPS_URL}/{group_id}",
        json={"name": " Buses   importados ", "description": "Nueva descripción"},
        headers={"Origin": settings.frontend_origin},
    )

    assert updated.status_code == 200
    assert updated.json() == {
        "id": group_id,
        "name": "Buses importados",
        "description": "Nueva descripción",
        "busCount": 0,
    }
    with Session(engine) as db:
        group = db.get(BusGroup, group_id)
        assert group is not None
        assert group.cooperative_id == cooperative.id
        assert group.normalized_name == "buses importados"


def test_group_edit_rejects_duplicate_name_and_foreign_group(test_environment):
    client, engine = test_environment
    create_cooperative_account(engine, name="Cooperativa Edita", email="edita@example.com")
    other_cooperative = create_cooperative_account(
        engine,
        name="Cooperativa Otra",
        email="otra-edit@example.com",
    )
    assert login(client, "edita@example.com").status_code == 200
    first = client.post(
        GROUPS_URL,
        json={"name": "Rancheras"},
        headers={"Origin": settings.frontend_origin},
    )
    second = client.post(
        GROUPS_URL,
        json={"name": "Importados"},
        headers={"Origin": settings.frontend_origin},
    )
    with Session(engine) as db:
        foreign = BusGroup(
            cooperative_id=other_cooperative.id,
            name="Grupo privado",
        )
        db.add(foreign)
        db.commit()
        db.refresh(foreign)
        foreign_group_id = foreign.id

    duplicate = client.patch(
        f"{GROUPS_URL}/{second.json()['id']}",
        json={"name": " rancheras "},
        headers={"Origin": settings.frontend_origin},
    )
    foreign_response = client.patch(
        f"{GROUPS_URL}/{foreign_group_id}",
        json={"name": "Nombre expuesto"},
        headers={"Origin": settings.frontend_origin},
    )

    assert first.status_code == second.status_code == 201
    assert duplicate.status_code == 409
    assert foreign_response.status_code == 404


def test_group_edit_validates_fields_and_rejects_empty_updates(test_environment):
    client, _engine = test_environment
    create_cooperative_account(
        _engine,
        name="Cooperativa Validar edición",
        email="validar-edicion@example.com",
    )
    assert login(client, "validar-edicion@example.com").status_code == 200
    created = client.post(
        GROUPS_URL,
        json={"name": "Temporales"},
        headers={"Origin": settings.frontend_origin},
    )
    url = f"{GROUPS_URL}/{created.json()['id']}"

    empty = client.patch(url, json={}, headers={"Origin": settings.frontend_origin})
    blank_name = client.patch(
        url,
        json={"name": "  "},
        headers={"Origin": settings.frontend_origin},
    )
    null_name = client.patch(
        url,
        json={"name": None},
        headers={"Origin": settings.frontend_origin},
    )
    long_description = client.patch(
        url,
        json={"description": "x" * 256},
        headers={"Origin": settings.frontend_origin},
    )

    assert created.status_code == 201
    assert empty.status_code == 422
    assert blank_name.status_code == 422
    assert null_name.status_code == 422
    assert long_description.status_code == 422


def test_cooperative_can_edit_description_without_changing_name(test_environment):
    client, _engine = test_environment
    create_cooperative_account(
        _engine,
        name="Cooperativa Descripción",
        email="descripcion@example.com",
    )
    assert login(client, "descripcion@example.com").status_code == 200
    created = client.post(
        GROUPS_URL,
        json={"name": "Urbanos", "description": "Anterior"},
        headers={"Origin": settings.frontend_origin},
    )

    updated = client.patch(
        f"{GROUPS_URL}/{created.json()['id']}",
        json={"description": None},
        headers={"Origin": settings.frontend_origin},
    )

    assert updated.status_code == 200
    assert updated.json()["name"] == "Urbanos"
    assert updated.json()["description"] is None


def test_cooperative_can_delete_an_empty_group(test_environment):
    client, _engine = test_environment
    create_cooperative_account(
        _engine,
        name="Cooperativa Elimina",
        email="elimina@example.com",
    )
    assert login(client, "elimina@example.com").status_code == 200
    created = client.post(
        GROUPS_URL,
        json={"name": "Grupo vacío"},
        headers={"Origin": settings.frontend_origin},
    )

    deleted = client.delete(
        f"{GROUPS_URL}/{created.json()['id']}",
        headers={"Origin": settings.frontend_origin},
    )

    assert created.status_code == 201
    assert deleted.status_code == 204
    assert client.get(GROUPS_URL).json() == []


def test_group_with_buses_cannot_be_deleted(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(
        engine,
        name="Cooperativa Protege buses",
        email="protege-buses@example.com",
    )
    assert login(client, "protege-buses@example.com").status_code == 200
    created = client.post(
        GROUPS_URL,
        json={"name": "En servicio"},
        headers={"Origin": settings.frontend_origin},
    )
    group_id = created.json()["id"]
    with Session(engine) as db:
        template = BusTemplate(
            cooperative_id=cooperative.id,
            name="Plantilla protección",
            rows=2,
            columns=2,
        )
        db.add(template)
        db.flush()
        db.add(
            Bus(
                cooperative_id=cooperative.id,
                number="02",
                plate="DEF-5678",
                chassis_brand="Marca",
                body_brand="Carrocería",
                template_id=template.id,
                group_id=group_id,
            )
        )
        db.commit()

    deleted = client.delete(
        f"{GROUPS_URL}/{group_id}",
        headers={"Origin": settings.frontend_origin},
    )

    assert deleted.status_code == 409
    assert client.get(GROUPS_URL).json()[0]["id"] == group_id
    assert client.get(GROUPS_URL).json()[0]["busCount"] == 1


def test_group_with_route_sheet_cannot_be_deleted(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(
        engine,
        name="Cooperativa Protege hoja",
        email="protege-hoja@example.com",
    )
    assert login(client, "protege-hoja@example.com").status_code == 200
    created = client.post(
        GROUPS_URL,
        json={"name": "Con hoja de ruta"},
        headers={"Origin": settings.frontend_origin},
    )
    group_id = created.json()["id"]
    with Session(engine) as db:
        db.add(
            RouteSheet(
                cooperative_id=cooperative.id,
                bus_group_id=group_id,
                service_date=date(2026, 10, 28),
            )
        )
        db.commit()

    deleted = client.delete(
        f"{GROUPS_URL}/{group_id}",
        headers={"Origin": settings.frontend_origin},
    )

    assert deleted.status_code == 409
    assert client.get(GROUPS_URL).json()[0]["id"] == group_id


def test_cooperative_cannot_delete_group_from_another_tenant(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        name="Cooperativa A",
        email="coop-a-delete@example.com",
    )
    other = create_cooperative_account(
        engine,
        name="Cooperativa B",
        email="coop-b-delete@example.com",
    )
    with Session(engine) as db:
        foreign = BusGroup(
            cooperative_id=other.id,
            name="Privado",
        )
        db.add(foreign)
        db.commit()
        db.refresh(foreign)
        foreign_group_id = foreign.id

    assert login(client, "coop-a-delete@example.com").status_code == 200
    deleted = client.delete(
        f"{GROUPS_URL}/{foreign_group_id}",
        headers={"Origin": settings.frontend_origin},
    )

    assert deleted.status_code == 404
    with Session(engine) as db:
        assert db.get(BusGroup, foreign_group_id) is not None
