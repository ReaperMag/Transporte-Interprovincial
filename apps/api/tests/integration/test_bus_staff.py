import pytest
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.modules.accounts.models import Account
from app.modules.buses.models import Bus, BusTemplate, SeatType, TemplateSeat
from app.modules.roles_permissions.seed import (
    COOPERATIVE_ADMIN_ROLE,
    COOPERATIVE_BUS_STAFF_ROLE,
)
from app.modules.staff.models import Staff, StaffPosition

from tests.integration.test_cooperative_authorization import (
    ORIGIN,
    PASSWORD,
    create_cooperative_account,
    create_passenger,
    login,
)


URL = "/api/v1/cooperatives/me/bus-staff"
DETAIL_URL = URL + "/{}"
PROFILE_URL = "/api/v1/bus-staff/me"


def create_bus(engine, cooperative_id: int, number: str, *, is_active: bool = True) -> int:
    with Session(engine) as db:
        template = BusTemplate(
            cooperative_id=cooperative_id,
            name=f"Plantilla {number}",
            rows=1,
            columns=1,
            seats=[TemplateSeat(number=1, row=1, column=1, seat_type=SeatType.NORMAL)],
        )
        db.add(template)
        db.flush()
        bus = Bus(
            cooperative_id=cooperative_id,
            number=number,
            plate=f"PBA-{int(number):04d}",
            chassis_brand="Hino",
            body_brand="Miral",
            template_id=template.id,
            is_active=is_active,
        )
        db.add(bus)
        db.commit()
        return bus.id


def payload(bus_id: int, **changes) -> dict:
    return {
        "firstName": "Carlos",
        "lastName": "Conductor",
        "idNumber": "1711111110",
        "email": "conductor@example.com",
        "phone": "0999999999",
        "assignedBusId": bus_id,
        "password": PASSWORD,
        "confirmPassword": PASSWORD,
        **changes,
    }


@pytest.fixture
def cooperative(test_environment):
    """Cooperativa con su administrador conectado y dos buses activos."""
    client, engine = test_environment
    _, cooperative_id = create_cooperative_account(
        engine,
        email="admin-bus@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    buses = [create_bus(engine, cooperative_id, "40"), create_bus(engine, cooperative_id, "41")]
    assert login(client, "admin-bus@example.com").status_code == 200
    return client, engine, cooperative_id, buses


def create_bus_staff(client, bus_id: int, **changes) -> dict:
    response = client.post(URL, json=payload(bus_id, **changes), headers=ORIGIN)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# Creación
# ---------------------------------------------------------------------------


def test_admin_creates_a_driver_with_an_assigned_bus(cooperative):
    client, engine, cooperative_id, buses = cooperative

    body = create_bus_staff(client, buses[0])

    assert body["position"] == "driver"
    assert body["isActive"] is True
    assert body["assignedBus"] == {"id": buses[0], "number": "40", "plate": "PBA-0040"}
    assert "password" not in body
    with Session(engine) as db:
        account = db.query(Account).filter_by(email="conductor@example.com").one()
        staff = db.query(Staff).filter_by(account_id=account.id).one()
        assert account.cooperative_id == cooperative_id
        assert account.role.code == COOPERATIVE_BUS_STAFF_ROLE
        assert staff.position == StaffPosition.DRIVER
        assert staff.assigned_bus_id == buses[0]
        assert verify_password(PASSWORD, account.password_hash)


def test_driver_and_controller_can_share_the_same_bus(cooperative):
    client, _, _, buses = cooperative

    create_bus_staff(client, buses[0])
    controller = create_bus_staff(
        client,
        buses[0],
        email="controlador@example.com",
        idNumber="1722222229",
        position="controller",
    )

    assert controller["position"] == "controller"
    listed = client.get(URL).json()
    assert [item["position"] for item in listed] == ["driver", "controller"]
    assert {item["assignedBus"]["id"] for item in listed} == {buses[0]}


def test_bus_staff_list_does_not_include_clerks(cooperative):
    client, _, _, buses = cooperative
    clerk = client.post(
        "/api/v1/cooperatives/me/office-users",
        json={
            "firstName": "Olga",
            "lastName": "Oficinista",
            "idNumber": "1733333338",
            "email": "oficina@example.com",
            "phone": "0988888888",
            "password": PASSWORD,
            "confirmPassword": PASSWORD,
        },
        headers=ORIGIN,
    )
    assert clerk.status_code == 201, clerk.text
    create_bus_staff(client, buses[0])

    assert [item["email"] for item in client.get(URL).json()] == ["conductor@example.com"]
    assert [
        item["email"]
        for item in client.get("/api/v1/cooperatives/me/office-users").json()
    ] == ["oficina@example.com"]


@pytest.mark.parametrize(
    ("field", "value"),
    [("email", "CONDUCTOR@example.com"), ("idNumber", "1711111110")],
)
def test_duplicate_email_or_id_number_returns_conflict(cooperative, field, value):
    client, _, _, buses = cooperative
    create_bus_staff(client, buses[0])

    changes = {"email": "otro@example.com", "idNumber": "1722222229", field: value}
    response = client.post(URL, json=payload(buses[1], **changes), headers=ORIGIN)

    assert response.status_code == 409


def test_cannot_assign_an_inactive_bus(cooperative):
    client, engine, cooperative_id, _ = cooperative
    inactive_bus = create_bus(engine, cooperative_id, "50", is_active=False)

    response = client.post(URL, json=payload(inactive_bus), headers=ORIGIN)

    assert response.status_code == 422
    assert response.json()["detail"] == "No se puede asignar un bus inactivo."


def test_cannot_assign_a_bus_of_another_cooperative(cooperative):
    client, engine, _, _ = cooperative
    _, other_cooperative_id = create_cooperative_account(
        engine, email="otra-bus@example.com", role_code=COOPERATIVE_ADMIN_ROLE
    )
    other_bus = create_bus(engine, other_cooperative_id, "60")

    response = client.post(URL, json=payload(other_bus), headers=ORIGIN)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "changes",
    [
        {"position": "clerk"},
        {"idNumber": "1234567890"},
        {"confirmPassword": "OtraClave12345!"},
        {"assignedBusId": None},
    ],
)
def test_invalid_bus_staff_data_is_rejected(cooperative, changes):
    client, _, _, buses = cooperative

    response = client.post(URL, json=payload(buses[0], **changes), headers=ORIGIN)

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Edición
# ---------------------------------------------------------------------------


def test_admin_changes_the_assigned_bus(cooperative):
    client, _, _, buses = cooperative
    created = create_bus_staff(client, buses[0])

    response = client.patch(
        DETAIL_URL.format(created["id"]),
        json={"assignedBusId": buses[1], "phone": "0977777777"},
        headers=ORIGIN,
    )

    assert response.status_code == 200, response.text
    assert response.json()["assignedBus"]["number"] == "41"
    assert response.json()["phone"] == "0977777777"


def test_deactivated_bus_staff_cannot_log_in(cooperative):
    client, engine, _, buses = cooperative
    created = create_bus_staff(client, buses[0])

    response = client.patch(
        DETAIL_URL.format(created["id"]),
        json={"isActive": False},
        headers=ORIGIN,
    )

    assert response.status_code == 200, response.text
    assert response.json()["isActive"] is False
    assert login(client, "conductor@example.com").status_code == 401
    with Session(engine) as db:
        # Se desactiva, no se borra: el historial de viajes lo necesita.
        assert db.query(Staff).filter_by(id=created["id"]).one().is_active is False

    login(client, "admin-bus@example.com")
    reactivated = client.patch(
        DETAIL_URL.format(created["id"]),
        json={"isActive": True},
        headers=ORIGIN,
    )
    assert reactivated.status_code == 200
    assert login(client, "conductor@example.com").status_code == 200


@pytest.mark.parametrize("changes", [{}, {"assignedBusId": None}, {"isActive": None}])
def test_update_requires_valid_changes(cooperative, changes):
    client, _, _, buses = cooperative
    created = create_bus_staff(client, buses[0])

    response = client.patch(DETAIL_URL.format(created["id"]), json=changes, headers=ORIGIN)

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Acceso
# ---------------------------------------------------------------------------


def test_cooperative_cannot_see_bus_staff_of_another(cooperative, test_environment):
    client, engine, _, buses = cooperative
    created = create_bus_staff(client, buses[0])
    create_cooperative_account(
        engine, email="ajena-bus@example.com", role_code=COOPERATIVE_ADMIN_ROLE
    )

    assert login(client, "ajena-bus@example.com").status_code == 200
    assert client.get(URL).json() == []
    assert client.get(DETAIL_URL.format(created["id"])).status_code == 404
    assert client.patch(
        DETAIL_URL.format(created["id"]),
        json={"isActive": False},
        headers=ORIGIN,
    ).status_code == 404


def test_only_the_cooperative_admin_manages_bus_staff(cooperative):
    client, engine, _, buses = cooperative
    create_bus_staff(client, buses[0])
    create_passenger(engine, "pasajero-bus@example.com")

    assert login(client, "conductor@example.com").status_code == 200
    assert client.get(URL).status_code == 403
    assert login(client, "pasajero-bus@example.com").status_code == 200
    assert client.get(URL).status_code == 403
    assert client.post(URL, json=payload(buses[1]), headers=ORIGIN).status_code == 403


# ---------------------------------------------------------------------------
# Sesión del personal del bus
# ---------------------------------------------------------------------------


def test_bus_staff_logs_in_and_reads_its_assigned_bus(cooperative):
    client, _, cooperative_id, buses = cooperative
    create_bus_staff(client, buses[0])

    response = login(client, "conductor@example.com")

    assert response.status_code == 200
    assert response.json()["accountType"] == "personal_bus"
    assert client.get("/api/v1/auth/me").json()["accountType"] == "personal_bus"
    profile = client.get(PROFILE_URL)
    assert profile.status_code == 200, profile.text
    assert profile.json()["firstName"] == "Carlos"
    assert profile.json()["position"] == "driver"
    assert profile.json()["cooperativeId"] == cooperative_id
    assert profile.json()["assignedBus"]["number"] == "40"


def test_bus_staff_has_no_access_to_office_functions(cooperative):
    client, _, _, buses = cooperative
    create_bus_staff(client, buses[0])
    assert login(client, "conductor@example.com").status_code == 200

    assert client.get("/api/v1/staff/me").status_code == 403
    assert client.get("/api/v1/payments/pending").status_code == 403
    assert client.get("/api/v1/cooperatives/me/profile").status_code == 403


def test_other_accounts_cannot_read_the_bus_staff_profile(cooperative):
    client, _, _, _ = cooperative

    assert client.get(PROFILE_URL).status_code == 403
