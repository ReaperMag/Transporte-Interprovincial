import pytest

from sqlalchemy.orm import Session

from app.modules.accounts.models import Account
from app.modules.auth.service import (
    InvalidCredentialsError,
    authenticate_passenger,
)
from app.modules.auth.tokens import decode_access_token


def test_authenticate_registered_passenger(
    test_environment,
    signup_data,
):
    client, engine = test_environment

    signup = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )

    assert signup.status_code == 201

    with Session(engine) as db:
        account, token = authenticate_passenger(
            db,
            signup_data["email"],
            signup_data["password"],
        )

        payload = decode_access_token(token)

        assert payload["sub"] == str(account.id)
        assert payload["account_type"] == "passenger"
        assert account.last_login_at is not None


def test_reject_incorrect_password(
    test_environment,
    signup_data,
):
    client, engine = test_environment

    signup = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )

    assert signup.status_code == 201

    with Session(engine) as db:
        with pytest.raises(InvalidCredentialsError):
            authenticate_passenger(
                db,
                signup_data["email"],
                "ClaveIncorrecta123!",
            )


def test_reject_unknown_email(test_environment):
    _, engine = test_environment

    with Session(engine) as db:
        with pytest.raises(InvalidCredentialsError):
            authenticate_passenger(
                db,
                "desconocido@example.com",
                "ClaveSegura123!",
            )


def test_reject_inactive_account(
    test_environment,
    signup_data,
):
    client, engine = test_environment

    signup = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )

    account_id = signup.json()["accountId"]

    with Session(engine) as db:
        account = db.get(Account, account_id)
        account.is_active = False
        db.commit()

        with pytest.raises(InvalidCredentialsError):
            authenticate_passenger(
                db,
                signup_data["email"],
                signup_data["password"],
            )