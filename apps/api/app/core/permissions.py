from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account, AccountType
from app.modules.roles_permissions.models import Role
from app.modules.roles_permissions.seed import (
    COOPERATIVE_ADMIN_ROLE,
    COOPERATIVE_CLERK_ROLE,
)
from app.modules.staff.models import Staff, StaffPosition


def require_admin_access(
    account: Annotated[Account, Depends(get_current_account)],
) -> None:
    """Require an active super-admin account for administrative routes."""
    if account.account_type.value != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para acceder a esta sección.",
        )


def _forbidden() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permisos para acceder a esta sección.",
    )


def _has_role(account: Account, db: Session, role_code: str) -> bool:
    return account.role_id is not None and db.scalar(
        select(Role.id).where(
            Role.id == account.role_id,
            Role.code == role_code,
        )
    ) is not None


def require_cooperative_admin(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(get_current_account)],
) -> Account:
    """Require an explicitly assigned cooperative administrator role."""
    if (
        account.account_type != AccountType.COOPERATIVE
        or account.cooperative_id is None
        or not _has_role(account, db, COOPERATIVE_ADMIN_ROLE)
    ):
        raise _forbidden()

    return account


def require_cooperative_access(
    account: Annotated[Account, Depends(require_cooperative_admin)],
) -> Account:
    """Backward-compatible name for routes that require administration access."""
    return account


def get_office_staff(db: Session, account: Account) -> Staff | None:
    """Return a consistent, active clerk profile for the authenticated account."""
    if (
        account.account_type != AccountType.COOPERATIVE
        or account.cooperative_id is None
        or (
            not _has_role(account, db, COOPERATIVE_CLERK_ROLE)
            and not _has_role(account, db, COOPERATIVE_ADMIN_ROLE)
        )
    ):
        return None

    staff = db.scalar(select(Staff).where(Staff.account_id == account.id))
    if (
        staff is None
        or not staff.is_active
        or staff.position
        not in (
            StaffPosition.CLERK
            if _has_role(account, db, COOPERATIVE_CLERK_ROLE)
            else StaffPosition.ADMIN,
        )
        or staff.cooperative_id != account.cooperative_id
    ):
        return None
    return staff


def require_office_staff(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(get_current_account)],
) -> Staff:
    """Require office staff with an explicit role and matching Staff tenant."""
    staff = get_office_staff(db, account)
    if staff is None:
        raise _forbidden()
    return staff