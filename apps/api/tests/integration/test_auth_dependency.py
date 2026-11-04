
from fastapi import Depends

from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account
from app.modules.auth.tokens import create_access_token


def test_reject_request_without_cookie(test_environment):
    client, _ = test_environment

    @client.app.get("/test/protected/no-cookie")
    def protected(account: Account = Depends(get_current_account)):
        return {"accountId": account.id}

    response = client.get("/test/protected/no-cookie")

    assert response.status_code == 401


def test_accept_valid_passenger_cookie(test_environment, signup_data):
    client, _ = test_environment

    signup = client.post("/api/v1/auth/signup", json=signup_data)
    assert signup.status_code == 201

    account_id = signup.json()["accountId"]

    @client.app.get("/test/protected/valid-cookie")
    def protected(account: Account = Depends(get_current_account)):
        return {"accountId": account.id}

    token = create_access_token(
        account_id=account_id,
        account_type="passenger",
    )

    response = client.get(
        "/test/protected/valid-cookie",
        cookies={"access_token": token},
    )

    assert response.status_code == 200
    assert response.json()["accountId"] == account_id


def test_reject_invalid_cookie(test_environment):
    client, _ = test_environment

    @client.app.get("/test/protected/invalid-cookie")
    def protected(account: Account = Depends(get_current_account)):
        return {"accountId": account.id}

    response = client.get(
        "/test/protected/invalid-cookie",
        cookies={"access_token": "token-invalido"},
    )

    assert response.status_code == 401
