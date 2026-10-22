from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import AccountType
from app.modules.accounts.repository import create_account


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

    payload = {"name": "Cooperativa Test", "ruc": "1234567890001"}
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
        json={"name": "Cooperativa Test", "ruc": "1234567890001"},
        headers=headers,
    )
    assert created.status_code == 201
    cooperative_id = created.json()["id"]

    updated = client.patch(
        f"/api/v1/admin/cooperatives/{cooperative_id}/status",
        json={"isActive": False},
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["isActive"] is False
