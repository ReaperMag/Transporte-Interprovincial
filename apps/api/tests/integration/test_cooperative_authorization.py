from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import BusGroup
from app.modules.cooperatives.models import Cooperative
from app.modules.roles_permissions.seed import (
    COOPERATIVE_ADMIN_ROLE,
    COOPERATIVE_CLERK_ROLE,
    ensure_default_roles,
)
from app.modules.staff.models import Staff, StaffPosition


PASSWORD = "ClaveSegura123!"
ORIGIN = {"Origin": settings.frontend_origin}
ADMIN_URLS = (
    "/api/v1/cooperatives/me",
    "/api/v1/cooperatives/me/profile",
    "/api/v1/cooperatives/me/groups",
    "/api/v1/cooperatives/me/buses",
    "/api/v1/cooperatives/me/route-planning/cities",
    "/api/v1/cooperatives/me/route-planning/routes",
)


def create_cooperative_account(
    engine,
    *,
    email: str,
    role_code: str | None,
    position: StaffPosition | None = None,
    staff_cooperative_id: int | None = None,
) -> tuple[int, int]:
    with Session(engine) as db:
        role = (
            ensure_default_roles(db).get(role_code)
            if role_code is not None
            else None
        )
        cooperative = Cooperative(
            name=email.split("@")[0],
            ruc=f"179{len(email):010d}{sum(map(ord, email)) % 1000:03d}",
        )
        db.add(cooperative)
        db.flush()
        account = Account(
            email=email,
            password_hash=hash_password(PASSWORD),
            account_type=AccountType.COOPERATIVE,
            cooperative_id=cooperative.id,
            role_id=role.id if role else None,
        )
        db.add(account)
        db.flush()
        if position is not None:
            db.add(
                Staff(
                    account_id=account.id,
                    cooperative_id=(
                        staff_cooperative_id
                        if staff_cooperative_id is not None
                        else cooperative.id
                    ),
                    first_name="Prueba",
                    last_name="Staff",
                    id_number=f"17{account.id:08d}",
                    phone=None,
                    position=position,
                )
            )
        db.commit()
        return account.id, cooperative.id


def create_passenger(engine, email: str) -> None:
    with Session(engine) as db:
        db.add(
            Account(
                email=email,
                password_hash=hash_password(PASSWORD),
                account_type=AccountType.PASSENGER,
            )
        )
        db.commit()


def login(client, email: str):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers=ORIGIN,
    )


def test_cooperative_admin_can_access_administrative_endpoints(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="admin-rutas@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )

    assert login(client, "admin-rutas@example.com").status_code == 200
    for url in ADMIN_URLS:
        assert client.get(url).status_code == 200, url


def test_clerk_is_denied_all_administrative_endpoints(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="clerk-rutas@example.com",
        role_code=COOPERATIVE_CLERK_ROLE,
        position=StaffPosition.CLERK,
    )

    assert login(client, "clerk-rutas@example.com").status_code == 200
    for url in ADMIN_URLS:
        assert client.get(url).status_code == 403, url


def test_unassigned_cooperative_account_is_denied_administrative_endpoints(
    test_environment,
):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="unassigned@example.com",
        role_code=None,
    )

    assert login(client, "unassigned@example.com").status_code == 200
    assert client.get("/api/v1/cooperatives/me/buses").status_code == 403


def test_passenger_is_denied_cooperative_administration(test_environment):
    client, engine = test_environment
    create_passenger(engine, "passenger@example.com")

    assert login(client, "passenger@example.com").status_code == 200
    assert client.get("/api/v1/cooperatives/me/groups").status_code == 403


def test_cooperative_admin_is_tenant_isolated(test_environment):
    client, engine = test_environment
    _, first_id = create_cooperative_account(
        engine,
        email="first@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    _, second_id = create_cooperative_account(
        engine,
        email="second@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
    )
    with Session(engine) as db:
        group = BusGroup(
            cooperative_id=second_id,
            name="Grupo privado",
            description=None,
        )
        db.add(group)
        db.commit()
        group_id = group.id

    assert first_id != second_id
    assert login(client, "first@example.com").status_code == 200
    assert client.get("/api/v1/cooperatives/me/groups").json() == []
    assert client.patch(
        f"/api/v1/cooperatives/me/groups/{group_id}",
        json={"name": "Intento"},
        headers=ORIGIN,
    ).status_code == 404


def test_valid_clerk_and_cooperative_admin_retain_office_permissions(test_environment):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        email="valid-clerk@example.com",
        role_code=COOPERATIVE_CLERK_ROLE,
        position=StaffPosition.CLERK,
    )
    create_cooperative_account(
        engine,
        email="valid-admin@example.com",
        role_code=COOPERATIVE_ADMIN_ROLE,
        position=StaffPosition.ADMIN,
    )

    assert login(client, "valid-clerk@example.com").status_code == 200
    assert client.get("/api/v1/payments/pending").status_code == 200
    client.cookies.clear()
    assert login(client, "valid-admin@example.com").status_code == 200
    assert client.get("/api/v1/payments/pending").status_code == 200


def test_invalid_office_staff_profiles_are_denied(test_environment):
    client, engine = test_environment
    _, foreign_cooperative_id = create_cooperative_account(
        engine,
        email="foreign@example.com",
        role_code=None,
    )
    create_cooperative_account(
        engine,
        email="inconsistent@example.com",
        role_code=COOPERATIVE_CLERK_ROLE,
        position=StaffPosition.CLERK,
        staff_cooperative_id=foreign_cooperative_id,
    )
    create_cooperative_account(
        engine,
        email="wrong-position@example.com",
        role_code=COOPERATIVE_CLERK_ROLE,
        position=StaffPosition.ADMIN,
    )
    create_cooperative_account(
        engine,
        email="no-role-staff@example.com",
        role_code=None,
        position=StaffPosition.CLERK,
    )

    for email in (
        "inconsistent@example.com",
        "wrong-position@example.com",
        "no-role-staff@example.com",
    ):
        client.cookies.clear()
        assert login(client, email).status_code == 200
        assert client.get("/api/v1/payments/pending").status_code == 403
