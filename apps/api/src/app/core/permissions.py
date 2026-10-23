from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account


def require_admin_access(
    account: Annotated[Account, Depends(get_current_account)],
) -> None:
    """Require an active super-admin account for administrative routes."""
    if account.account_type.value != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para acceder a esta sección.",
        )