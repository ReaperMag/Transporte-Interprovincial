import pytest
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.bootstrap import ensure_initial_admin
from app.core.security import hash_password, verify_password
from app.modules.accounts.models import Account, AccountType
from app.modules.accounts.repository import create_account, get_account_by_email
from app.modules.cooperatives.models import Cooperative


def create_account_for_login(engine, *, email: str, account_type: AccountType) -> None:
    with Session(engine) as db:
        create_account(
            db,
            email=email,
            password_hash=hash_password("ClaveAdminSegura123!"),
            account_type=account_type,
        )
        db.commit()


def login(client, email: str, password: str = "ClaveAdminSegura123!"):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"Origin": settings.frontend_origin},
    )


def test_admin_routes_reject_unauthenticated_requests(test_environment):
    client, _ = test_environment

    response = client.get("/api/v1/admin/cooperatives/summary")

    assert response.status_code == 401


def test_startup_creates_only_one_initial_admin(test_environment):
    client, engine = test_environment

    with Session(engine) as db:
        admins = db.query(Account).filter(
            Account.account_type == AccountType.SUPER_ADMIN
        ).all()
        assert len(admins) == 1
        assert admins[0].email == "bootstrap-admin@example.com"
        assert verify_password("TestBootstrapAdmin123!", admins[0].password_hash)
        assert ensure_initial_admin(db) is False
        assert db.query(Account).filter(
            Account.account_type == AccountType.SUPER_ADMIN
        ).count() == 1

    login_response = login(
        client,
        "bootstrap-admin@example.com",
        "TestBootstrapAdmin123!",
    )
    assert login_response.status_code == 200
    assert login_response.json()["accountType"] == "super_admin"


def test_admin_routes_reject_passenger_accounts(test_environment, signup_data):
    client, _ = test_environment
    signup = client.post("/api/v1/auth/signup", json=signup_data)
    assert signup.status_code == 201
    assert login(
        client,
        signup_data["email"],
        signup_data["password"],
    ).status_code == 200

    response = client.get("/api/v1/admin/cooperatives/summary")

    assert response.status_code == 403


def test_super_admin_can_login_and_access_admin_routes(test_environment):
    client, engine = test_environment
    email = "admin@example.com"
    create_account_for_login(
        engine,
        email=email,
        account_type=AccountType.SUPER_ADMIN,
    )

    login_response = login(client, email)
    summary_response = client.get("/api/v1/admin/cooperatives/summary")

    assert login_response.status_code == 200
    assert login_response.json()["accountType"] == "super_admin"
    assert summary_response.status_code == 200
    assert summary_response.json() == {"cooperatives": 0}


def test_admin_mutations_require_the_configured_origin(test_environment):
    client, engine = test_environment
    email = "admin@example.com"
    create_account_for_login(
        engine,
        email=email,
        account_type=AccountType.SUPER_ADMIN,
    )
    assert login(client, email).status_code == 200

    payload = {
        "name": "Cooperativa Test",
        "ruc": "1234567890001",
        "accountEmail": "cooperativa@example.com",
        "initialPassword": "ClaveCooperativa123!",
    }
    response = client.post("/api/v1/admin/cooperatives", json=payload)

    assert response.status_code == 403


def test_super_admin_can_create_and_update_cooperatives(test_environment):
    client, engine = test_environment
    email = "admin@example.com"
    create_account_for_login(
        engine,
        email=email,
        account_type=AccountType.SUPER_ADMIN,
    )
    assert login(client, email).status_code == 200

    headers = {"Origin": settings.frontend_origin}
    created = client.post(
        "/api/v1/admin/cooperatives",
        json={
            "name": "Cooperativa Test",
            "ruc": "1234567890001",
            "accountEmail": "cooperativa@example.com",
            "initialPassword": "ClaveCooperativa123!",
            "phone": "0991234567",
        },
        headers=headers,
    )
    assert created.status_code == 201
    cooperative_id = created.json()["id"]

    updated = client.patch(
        f"/api/v1/admin/cooperatives/{cooperative_id}",
        json={"phone": "0987654321"},
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["phone"] == "0987654321"

    status_update = client.patch(
        f"/api/v1/admin/cooperatives/{cooperative_id}",
        json={"isActive": False},
        headers=headers,
    )
    assert status_update.status_code == 422

    removed_status_route = client.patch(
        f"/api/v1/admin/cooperatives/{cooperative_id}/status",
        json={"isActive": False},
        headers=headers,
    )
    assert removed_status_route.status_code == 404


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("email", "contacto@cooperativa.ec"),
        ("logoUrl", "https://example.com/logo.png"),
        ("isActive", False),
    ],
)
def test_admin_create_rejects_contact_email_logo_and_status(
    test_environment,
    field,
    value,
):
    client, engine = test_environment
    admin_email = "admin@example.com"
    create_account_for_login(
        engine,
        email=admin_email,
        account_type=AccountType.SUPER_ADMIN,
    )
    assert login(client, admin_email).status_code == 200

    payload = {
        "name": "Cooperativa Test",
        "ruc": "1234567890001",
        "accountEmail": "registro@cooperativa.ec",
        "initialPassword": "ClaveCooperativa123!",
        field: value,
    }
    response = client.post(
        "/api/v1/admin/cooperatives",
        json=payload,
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 422
    with Session(engine) as db:
        assert db.query(Cooperative).count() == 0
        assert get_account_by_email(db, "registro@cooperativa.ec") is None


def test_creating_cooperative_creates_linked_login_account(test_environment):
    client, engine = test_environment
    admin_email = "admin@example.com"
    create_account_for_login(
        engine,
        email=admin_email,
        account_type=AccountType.SUPER_ADMIN,
    )
    assert login(client, admin_email).status_code == 200

    response = client.post(
        "/api/v1/admin/cooperatives",
        json={
            "name": "Cooperativa con cuenta",
            "ruc": "1234567890001",
            "accountEmail": "cuenta@cooperativa.ec",
            "initialPassword": "ClaveCooperativa123!",
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 201
    cooperative_id = response.json()["id"]
    assert "initialPassword" not in response.json()

    with Session(engine) as db:
        account = get_account_by_email(db, "cuenta@cooperativa.ec")
        cooperative = db.get(Cooperative, cooperative_id)
        assert account is not None
        assert account.account_type == AccountType.COOPERATIVE
        assert account.cooperative_id == cooperative_id
        assert account.password_hash != "ClaveCooperativa123!"
        assert cooperative is not None
        assert cooperative.email is None
        assert cooperative.logo_url is None

    cooperative_login = login(
        client,
        "cuenta@cooperativa.ec",
        "ClaveCooperativa123!",
    )
    assert cooperative_login.status_code == 200
    assert cooperative_login.json()["accountType"] == "cooperative"
    assert client.get("/api/v1/auth/me").json()["accountType"] == "cooperative"

    identity = client.get("/api/v1/cooperatives/me")
    assert identity.status_code == 200
    assert identity.json() == {
        "id": cooperative_id,
        "name": "Cooperativa con cuenta",
        "ruc": "1234567890001",
    }
    assert client.get("/api/v1/admin/cooperatives/summary").status_code == 403


def test_duplicate_account_email_does_not_create_cooperative(test_environment):
    client, engine = test_environment
    admin_email = "admin@example.com"
    create_account_for_login(
        engine,
        email=admin_email,
        account_type=AccountType.SUPER_ADMIN,
    )
    create_account_for_login(
        engine,
        email="existing@example.com",
        account_type=AccountType.PASSENGER,
    )
    assert login(client, admin_email).status_code == 200

    response = client.post(
        "/api/v1/admin/cooperatives",
        json={
            "name": "No debe guardarse",
            "ruc": "1234567890001",
            "accountEmail": "existing@example.com",
            "initialPassword": "ClaveCooperativa123!",
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 409
    with Session(engine) as db:
        assert db.query(Cooperative).count() == 0
        assert db.query(Account).count() == 3


def test_cooperative_identity_rejects_non_cooperative_accounts(
    test_environment,
    signup_data,
):
    client, _ = test_environment
    signup = client.post("/api/v1/auth/signup", json=signup_data)
    assert signup.status_code == 201
    assert login(client, signup_data["email"], signup_data["password"]).status_code == 200

    response = client.get("/api/v1/cooperatives/me")

    assert response.status_code == 403


def test_cooperative_identity_rejects_unlinked_cooperative_account(test_environment):
    client, engine = test_environment
    email = "unlinked@example.com"
    create_account_for_login(
        engine,
        email=email,
        account_type=AccountType.COOPERATIVE,
    )
    assert login(client, email).status_code == 200

    response = client.get("/api/v1/cooperatives/me")

    assert response.status_code == 403
