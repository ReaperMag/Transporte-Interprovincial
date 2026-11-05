import pytest
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.modules.accounts.models import Account, AccountType
from app.modules.roles_permissions.models import Role
from app.modules.roles_permissions.seed import COOPERATIVE_ADMIN_ROLE
from app.modules.staff import service as staff_service
from app.modules.staff.models import Staff, StaffPosition
from app.modules.staff.schemas import OfficeUserCreate

from tests.integration.test_cooperative_authorization import (
    ORIGIN,
    create_cooperative_account,
    create_passenger,
    login,
)


URL = "/api/v1/cooperatives/me/office-users"
DETAIL_URL = URL + "/{}"
VALID_PAYLOAD = {
    "firstName": "Oficinista",
    "lastName": "Prueba",
    "idNumber": "0900000001",
    "email": "oficinista@example.com",
    "phone": "0999999999",
    "password": "ClaveSegura123!",
    "confirmPassword": "ClaveSegura123!",
}


def test_cooperative_admin_creates_clerk_in_own_cooperative(test_environment):
    client, engine = test_environment
    _, cooperative_id = create_cooperative_account(
        engine,
        email="admin-office@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "admin-office@example.com").status_code == 200
    assert client.get("/api/v1/staff/me").status_code == 403

    response = client.post(URL, json=VALID_PAYLOAD, headers=ORIGIN)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == VALID_PAYLOAD["email"]
    assert body["position"] == "clerk"
    assert "password" not in body
    assert "passwordHash" not in body

    with Session(engine) as db:
        account = db.query(Account).filter_by(email=VALID_PAYLOAD["email"]).one()
        staff = db.query(Staff).filter_by(account_id=account.id).one()
        clerk_role = db.query(type(account.role)).filter_by(code="cooperative_clerk").one()
        assert account.account_type == AccountType.COOPERATIVE
        assert account.cooperative_id == cooperative_id
        assert account.role_id == clerk_role.id
        assert staff.cooperative_id == cooperative_id
        assert staff.position == StaffPosition.CLERK
        assert verify_password(VALID_PAYLOAD["password"], account.password_hash)

        clerk_login = login(client, VALID_PAYLOAD["email"])
        assert clerk_login.status_code == 200
        assert clerk_login.json()["accountType"] == "oficinista"
        assert client.get("/api/v1/auth/me").json()["accountType"] == "oficinista"
        profile = client.get("/api/v1/staff/me")
        assert profile.status_code == 200
        assert profile.json()["email"] == VALID_PAYLOAD["email"]
        assert profile.json()["firstName"] == "Oficinista"
        assert profile.json()["lastName"] == "Prueba"
        assert profile.json()["cooperativeId"] == cooperative_id
        assert profile.json()["cooperativeRuc"]
        assert "cooperativeAddress" in profile.json()
        assert "cooperativeSupportEmail" in profile.json()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("email", "ADMIN-OFFICE@EXAMPLE.COM"),
        ("idNumber", "0900000001"),
    ],
)
def test_duplicate_office_user_identity_returns_conflict(
    test_environment, field, value
):
    client, engine = test_environment
    _, cooperative_id = create_cooperative_account(
        engine,
        email="admin-office@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    with Session(engine) as db:
        db.add(
            Account(
                email="existing@example.com",
                password_hash="not-used",
                account_type=AccountType.PASSENGER,
            )
        )
        db.commit()
        if field == "idNumber":
            account = db.query(Account).filter_by(email="existing@example.com").one()
            db.add(
                Staff(
                    account_id=account.id,
                    cooperative_id=cooperative_id,
                    first_name="Existente",
                    last_name="Prueba",
                    id_number=value,
                    phone="0999999999",
                    position=StaffPosition.CLERK,
                )
            )
            db.commit()

    assert login(client, "admin-office@example.com").status_code == 200
    payload = {**VALID_PAYLOAD, field: value}
    if field == "email":
        payload["idNumber"] = "0900000019"
    assert client.post(URL, json=payload, headers=ORIGIN).status_code == 409


def test_invalid_id_and_forbidden_fields_are_rejected(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="admin-office@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "admin-office@example.com").status_code == 200

    invalid_id = {**VALID_PAYLOAD, "idNumber": "1712345679"}
    assert client.post(URL, json=invalid_id, headers=ORIGIN).status_code == 422

    forged = {**VALID_PAYLOAD, "roleId": 1, "cooperativeId": 999, "position": "admin"}
    assert client.post(URL, json=forged, headers=ORIGIN).status_code == 422


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("phone", "09912345678"),
        ("phone", "09 91234567"),
        ("email", "correo-invalido"),
        ("confirmPassword", "OtraClave123!"),
    ],
)
def test_invalid_phone_and_password_confirmation_are_rejected(
    test_environment, field, value
):
    client, _ = test_environment
    create_cooperative_account(
        test_environment[1],
        email="invalid-fields-admin@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "invalid-fields-admin@example.com").status_code == 200
    payload = {**VALID_PAYLOAD, field: value}
    assert client.post(URL, json=payload, headers=ORIGIN).status_code == 422


def test_only_cooperative_admin_can_create_office_users(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="clerk-office@example.com",
        role_code="cooperative_clerk",
        position=StaffPosition.CLERK,
    )
    create_cooperative_account(
        engine,
        email="unassigned-office@example.com",
        role_code=None,
    )
    create_passenger(engine, "passenger-office@example.com")

    for email in (
        "clerk-office@example.com",
        "unassigned-office@example.com",
        "passenger-office@example.com",
    ):
        client.cookies.clear()
        assert login(client, email).status_code == 200
        assert client.post(URL, json=VALID_PAYLOAD, headers=ORIGIN).status_code == 403


def test_missing_clerk_role_fails_without_creating_account(test_environment):
    client, engine = test_environment
    _, cooperative_id = create_cooperative_account(
        engine,
        email="admin-office@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    with Session(engine) as db:
        db.query(Role).filter_by(code="cooperative_clerk").delete()
        db.commit()

    assert login(client, "admin-office@example.com").status_code == 200
    response = client.post(URL, json=VALID_PAYLOAD, headers=ORIGIN)

    assert response.status_code == 500
    with Session(engine) as db:
        assert db.query(Account).filter_by(email=VALID_PAYLOAD["email"]).one_or_none() is None
        assert db.query(Staff).filter_by(cooperative_id=cooperative_id).count() == 0


def test_csrf_origin_is_required(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="admin-office@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "admin-office@example.com").status_code == 200
    assert client.post(URL, json=VALID_PAYLOAD).status_code == 403


def test_staff_failure_rolls_back_account(test_environment):
    _, engine = test_environment
    with Session(engine) as db:
        cooperative_id = create_cooperative_account(
            engine,
            email="admin-office@example.com",
            role_code=COOPERATIVE_ADMIN_ROLE,
        )[1]
        payload = OfficeUserCreate.model_validate(VALID_PAYLOAD)

        def fail_staff_insert(*args, **kwargs):
            raise RuntimeError("simulated staff failure")

        event.listen(Staff, "before_insert", fail_staff_insert)
        try:
            with pytest.raises(RuntimeError):
                staff_service.create_office_user(
                    db,
                    cooperative_id=cooperative_id,
                    data=payload,
                )
        finally:
            event.remove(Staff, "before_insert", fail_staff_insert)
        assert db.query(Account).filter_by(email=payload.email).one_or_none() is None


def _create_registered_clerk(client, email="registered@example.com"):
    id_number = {
        "registered@example.com": "0900000019",
        "foreign-clerk@example.com": "0900000027",
        "read-clerk@example.com": "0900000035",
        "update-clerk@example.com": "0900000043",
        "identity-clerk@example.com": "0900000050",
        "target-update@example.com": "0900000076",
        "other-update@example.com": "0900000084",
    }.get(email, "0900000068")
    response = client.post(
        URL,
        json={
            **VALID_PAYLOAD,
            "email": email,
            "idNumber": id_number,
        },
        headers=ORIGIN,
    )
    assert response.status_code == 201
    return response.json()


def test_admin_lists_only_clerks_from_own_cooperative(test_environment):
    client, engine = test_environment
    _, first_cooperative_id = create_cooperative_account(
        engine, email="first-admin@example.com", role_code=COOPERATIVE_ADMIN_ROLE
    )
    _, second_cooperative_id = create_cooperative_account(
        engine, email="second-admin@example.com", role_code=COOPERATIVE_ADMIN_ROLE
    )
    create_cooperative_account(
        engine,
        email="driver@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
        position=StaffPosition.DRIVER,
    )
    create_cooperative_account(
        engine,
        email="controller@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
        position=StaffPosition.CONTROLLER,
    )

    assert login(client, "first-admin@example.com").status_code == 200
    own = _create_registered_clerk(client)
    client.cookies.clear()
    assert login(client, "second-admin@example.com").status_code == 200
    foreign = _create_registered_clerk(client, "foreign-clerk@example.com")
    client.cookies.clear()
    assert login(client, "first-admin@example.com").status_code == 200

    response = client.get(URL)
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [own["id"]]
    assert own["id"] != foreign["id"]
    with Session(engine) as db:
        assert db.query(Staff).filter_by(cooperative_id=first_cooperative_id).count() == 1
        assert db.query(Staff).filter_by(cooperative_id=second_cooperative_id).count() == 1


def test_admin_lists_empty_when_no_clerks(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine, email="empty-admin@example.com", role_code=COOPERATIVE_ADMIN_ROLE
    )
    assert login(client, "empty-admin@example.com").status_code == 200
    assert client.get(URL).json() == []


def test_admin_reads_only_own_clerk(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine, email="read-admin@example.com", role_code=COOPERATIVE_ADMIN_ROLE
    )
    assert login(client, "read-admin@example.com").status_code == 200
    clerk = _create_registered_clerk(client, "read-clerk@example.com")
    assert client.get(DETAIL_URL.format(clerk["id"])).json() == clerk

    client.cookies.clear()
    create_cooperative_account(
        engine, email="other-admin@example.com", role_code=COOPERATIVE_ADMIN_ROLE
    )
    assert login(client, "other-admin@example.com").status_code == 200
    assert client.get(DETAIL_URL.format(clerk["id"])).status_code == 404


def test_admin_updates_clerk_and_can_keep_current_identity(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="update-admin@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "update-admin@example.com").status_code == 200
    clerk = _create_registered_clerk(client, "update-clerk@example.com")

    response = client.patch(
        DETAIL_URL.format(clerk["id"]),
        json={
            "firstName": "Nombre Actualizado",
            "lastName": "Apellido Actualizado",
            "idNumber": clerk["idNumber"],
            "email": clerk["email"],
            "phone": "0991112233",
        },
        headers=ORIGIN,
    )
    assert response.status_code == 200
    assert response.json()["firstName"] == "Nombre Actualizado"
    assert response.json()["phone"] == "0991112233"

    with Session(engine) as db:
        account = db.query(Account).filter_by(id=clerk["accountId"]).one()
        staff = db.query(Staff).filter_by(id=clerk["id"]).one()
        assert account.email == clerk["email"]
        assert staff.first_name == "Nombre Actualizado"
        assert staff.last_name == "Apellido Actualizado"


def test_admin_updates_email_and_id_and_rejects_forbidden_fields(test_environment):
    client, _ = test_environment
    create_cooperative_account(
        test_environment[1],
        email="identity-admin@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "identity-admin@example.com").status_code == 200
    clerk = _create_registered_clerk(client, "identity-clerk@example.com")
    response = client.patch(
        DETAIL_URL.format(clerk["id"]),
        json={"email": "new-identity@example.com", "idNumber": "0900000027"},
        headers=ORIGIN,
    )
    assert response.status_code == 200
    assert response.json()["email"] == "new-identity@example.com"
    assert response.json()["idNumber"] == "0900000027"

    forbidden = client.patch(
        DETAIL_URL.format(clerk["id"]),
        json={"roleId": 1, "cooperativeId": 999, "position": "admin"},
        headers=ORIGIN,
    )
    assert forbidden.status_code == 422


def test_admin_deletes_only_own_office_users(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="delete-admin@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "delete-admin@example.com").status_code == 200
    clerk = _create_registered_clerk(client, "delete-clerk@example.com")

    response = client.delete(DETAIL_URL.format(clerk["id"]), headers=ORIGIN)
    assert response.status_code == 204
    assert client.get(DETAIL_URL.format(clerk["id"])).status_code == 404
    with Session(engine) as db:
        assert db.query(Account).filter_by(id=clerk["accountId"]).one_or_none() is None
        assert db.query(Staff).filter_by(id=clerk["id"]).one_or_none() is None


def test_admin_cannot_delete_another_cooperatives_office_user(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="delete-owner@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "delete-owner@example.com").status_code == 200
    clerk = _create_registered_clerk(client, "foreign-delete-clerk@example.com")
    client.cookies.clear()
    create_cooperative_account(
        engine,
        email="delete-outsider@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "delete-outsider@example.com").status_code == 200

    assert client.delete(DETAIL_URL.format(clerk["id"]), headers=ORIGIN).status_code == 404
    with Session(engine) as db:
        assert db.query(Account).filter_by(id=clerk["accountId"]).one_or_none() is not None
        assert db.query(Staff).filter_by(id=clerk["id"]).one_or_none() is not None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("email", "duplicate-update@example.com"),
        ("idNumber", "0900000068"),
    ],
)
def test_update_duplicate_identity_returns_conflict(test_environment, field, value):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="duplicate-admin@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "duplicate-admin@example.com").status_code == 200
    target = _create_registered_clerk(client, "target-update@example.com")
    other = _create_registered_clerk(client, "other-update@example.com")

    conflict_value = other["email"] if field == "email" else other["idNumber"]
    response = client.patch(
        DETAIL_URL.format(target["id"]),
        json={field: conflict_value},
        headers=ORIGIN,
    )
    assert response.status_code == 409


def test_update_rejects_invalid_id_empty_patch_and_missing_csrf(test_environment):
    client, _ = test_environment
    create_cooperative_account(
        test_environment[1],
        email="validation-admin@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "validation-admin@example.com").status_code == 200
    target = _create_registered_clerk(client, "validation-clerk@example.com")

    assert client.patch(
        DETAIL_URL.format(target["id"]),
        json={"idNumber": "1712345679"},
        headers=ORIGIN,
    ).status_code == 422
    assert client.patch(
        DETAIL_URL.format(target["id"]),
        json={},
        headers=ORIGIN,
    ).status_code == 422
    assert client.patch(
        DETAIL_URL.format(target["id"]),
        json={"firstName": "Sin CSRF"},
    ).status_code == 403


def test_update_failure_rolls_back_account_and_staff(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="rollback-admin@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "rollback-admin@example.com").status_code == 200
    target = _create_registered_clerk(client, "rollback-clerk@example.com")

    def fail_staff_update(*args, **kwargs):
        raise RuntimeError("simulated update failure")

    event.listen(Staff, "before_update", fail_staff_update)
    try:
        with pytest.raises(RuntimeError):
            client.patch(
                DETAIL_URL.format(target["id"]),
                json={
                    "firstName": "No Persistir",
                    "email": "no-persistir@example.com",
                },
                headers=ORIGIN,
            )
    finally:
        event.remove(Staff, "before_update", fail_staff_update)

    with Session(engine) as db:
        account = db.query(Account).filter_by(id=target["accountId"]).one()
        staff = db.query(Staff).filter_by(id=target["id"]).one()
        assert account.email == "rollback-clerk@example.com"
        assert staff.first_name == "Oficinista"


def test_non_admin_cannot_list_read_or_update_office_users(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="clerk-caller@example.com",
        role_code="cooperative_clerk",
        position=StaffPosition.CLERK,
    )
    create_passenger(engine, "passenger-caller@example.com")

    for email in ("clerk-caller@example.com", "passenger-caller@example.com"):
        client.cookies.clear()
        assert login(client, email).status_code == 200
        assert client.get(URL).status_code == 403
        assert client.get(DETAIL_URL.format(1)).status_code == 403
        assert client.patch(
            DETAIL_URL.format(1),
            json={"firstName": "No autorizado"},
            headers=ORIGIN,
        ).status_code == 403
