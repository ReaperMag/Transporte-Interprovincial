from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account, AccountType


def require_admin_access(
    account: Annotated[Account, Depends(get_current_account)],
) -> None:
    """Require an active super-admin account for administrative routes."""
    if account.account_type.value != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para acceder a esta sección.",
        )


def require_cooperative_access(
    account: Annotated[Account, Depends(get_current_account)],
) -> Account:
    """Require an authenticated account linked to a cooperative."""
    if (
        account.account_type != AccountType.COOPERATIVE
        or account.cooperative_id is None
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para acceder a esta sección.",
        )

    return account