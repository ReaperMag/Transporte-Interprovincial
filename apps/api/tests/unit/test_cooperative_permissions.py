from sqlalchemy import select
from sqlalchemy.orm import Session

import pytest

from app.core.permissions import get_office_staff
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.cooperatives.models import Cooperative
from app.modules.roles_permissions.models import Role
from app.modules.roles_permissions.seed import (
    COOPERATIVE_ADMIN_ROLE,
    COOPERATIVE_CLERK_ROLE,
    ensure_default_roles,
)
from app.modules.roles_permissions.service import (
    LegacyAdminMigrationError,
    assign_legacy_cooperative_admins,
)
from app.modules.staff.models import Staff, StaffPosition


def create_account(db, email, cooperative_id, role_id=None):
    account = Account(
        email=email,
        password_hash=hash_password("ClaveSegura123!"),
        account_type=AccountType.COOPERATIVE,
        cooperative_id=cooperative_id,
        role_id=role_id,
    )
    db.add(account)
    db.flush()
    return account


def test_roles_are_seeded_idempotently(test_environment):
    _, engine = test_environment
    with Session(engine) as db:
        first = ensure_default_roles(db)
        second = ensure_default_roles(db)
        db.commit()
        assert first[COOPERATIVE_ADMIN_ROLE].id == second[COOPERATIVE_ADMIN_ROLE].id
        assert db.query(Role).filter(Role.code == COOPERATIVE_CLERK_ROLE).count() == 1


def test_admin_requires_explicit_role_and_clerk_requires_matching_staff(test_environment):
    _, engine = test_environment
    with Session(engine) as db:
        roles = ensure_default_roles(db)
        cooperative = Cooperative(name="Andina", ruc="1791234567001")
        db.add(cooperative)
        db.flush()
        unassigned = create_account(db, "sin-rol@example.com", cooperative.id)
        clerk = create_account(
            db,
            "clerk@example.com",
            cooperative.id,
            roles[COOPERATIVE_CLERK_ROLE].id,
        )
        db.add(
            Staff(
                account_id=clerk.id,
                cooperative_id=cooperative.id,
                first_name="Ana",
                last_name="Clerk",
                id_number="1712345675",
                phone=None,
                position=StaffPosition.CLERK,
            )
        )
        db.commit()

        assert unassigned.role_id is None
        assert get_office_staff(db, unassigned) is None
        assert get_office_staff(db, clerk) is not None


def test_legacy_admin_assignment_is_explicit_and_idempotent(test_environment):
    _, engine = test_environment
    with Session(engine) as db:
        cooperative = Cooperative(name="Costa", ruc="1791234567002")
        db.add(cooperative)
        db.flush()
        create_account(db, "legacy@example.com", cooperative.id)
        db.commit()

        assert assign_legacy_cooperative_admins(db, ["legacy@example.com"]) == 1
        db.commit()
        assert assign_legacy_cooperative_admins(db, ["legacy@example.com"]) == 0
        db.commit()
        account = db.scalar(
            select(Account).where(Account.email == "legacy@example.com")
        )
        assert account.role.code == COOPERATIVE_ADMIN_ROLE


def test_legacy_admin_assignment_validates_batch_before_assigning(test_environment):
    _, engine = test_environment
    with Session(engine) as db:
        roles = ensure_default_roles(db)
        cooperative = Cooperative(name="Sierra", ruc="1791234567003")
        db.add(cooperative)
        db.flush()
        valid = create_account(db, "valid@example.com", cooperative.id)
        wrong_role = create_account(
            db,
            "wrong-role@example.com",
            cooperative.id,
            roles[COOPERATIVE_CLERK_ROLE].id,
        )
        staff_account = create_account(db, "staff@example.com", cooperative.id)
        db.add(
            Staff(
                account_id=staff_account.id,
                cooperative_id=cooperative.id,
                first_name="Staff",
                last_name="Existing",
                id_number="1712345679",
                phone=None,
                position=StaffPosition.CLERK,
            )
        )
        db.commit()

        with pytest.raises(LegacyAdminMigrationError):
            assign_legacy_cooperative_admins(
                db,
                ["valid@example.com", "missing@example.com"],
            )
        db.rollback()
        assert valid.role_id is None

        with pytest.raises(LegacyAdminMigrationError):
            assign_legacy_cooperative_admins(db, [wrong_role.email])
        db.rollback()

        with pytest.raises(LegacyAdminMigrationError):
            assign_legacy_cooperative_admins(db, [staff_account.email])
        db.rollback()
