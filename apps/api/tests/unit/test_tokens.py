import pytest

from app.modules.auth.tokens import (
    InvalidTokenError,
    create_access_token,
    decode_access_token,
)


def test_create_and_decode_access_token():
    token = create_access_token(
        account_id=1,
        account_type="passenger",
    )

    payload = decode_access_token(token)

    assert payload["sub"] == "1"
    assert payload["account_type"] == "passenger"
    assert "exp" in payload
    assert "iat" in payload
    assert "jti" in payload


def test_reject_invalid_token():
    with pytest.raises(InvalidTokenError):
        decode_access_token("token-invalido")


def test_create_and_decode_super_admin_token():
    token = create_access_token(account_id=1, account_type="super_admin")

    payload = decode_access_token(token)

    assert payload["account_type"] == "super_admin"


def test_reject_unknown_account_type():
    with pytest.raises(ValueError):
        create_access_token(account_id=1, account_type="unknown")


def test_reject_invalid_account_id():
    with pytest.raises(ValueError):
        create_access_token(
            account_id=0,
            account_type="passenger",
        )