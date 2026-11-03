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
VALID_PAYLOAD = {
    "firstName": "Oficinista",
    "lastName": "Prueba",
    "idNumber": "0900000001",
    "email": "oficinista@example.com",
    "phone": "0999999999",
    "password": "ClaveSegura123!",
}


def test_cooperative_admin_creates_clerk_in_own_cooperative(test_environment):
    client, engine = test_environment
    _, cooperative_id = create_cooperative_account(
        engine,
        email="admin-office@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    assert login(client, "admin-office@example.com").status_code == 200

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
