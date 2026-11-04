
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.accounts.models import Account
from app.modules.accounts.repository import get_account_by_id
from app.modules.auth.tokens import InvalidTokenError, decode_access_token


def get_current_account(
    db: Annotated[Session, Depends(get_db)],
    access_token: Annotated[str | None, Cookie()] = None,
) -> Account:
    """Obtiene una cuenta activa a partir de su cookie JWT."""

    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado.",
    )

    if not access_token:
        raise unauthorized

    try:
        payload = decode_access_token(access_token)
        account_id = int(payload["sub"])
    except (InvalidTokenError, ValueError, TypeError, KeyError):
        raise unauthorized from None

    account = get_account_by_id(db, account_id)

    if (
        account is None
        or not account.is_active
    ):
        raise unauthorized

    return account
