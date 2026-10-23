
from unittest.mock import patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.modules.accounts.models import Account
from app.modules.passengers.models import Passenger


def test_successful_signup(test_environment, signup_data):
    client, engine = test_environment

    response = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )

    assert response.status_code == 201

    result = response.json()

    assert result["accountType"] == "passenger"
    assert result["email"] == "ana@example.com"
    assert "password" not in result
    assert "password_hash" not in result

    with Session(engine) as db:
        account = db.get(Account, result["accountId"])

        passenger = db.scalar(
            select(Passenger).where(
                Passenger.account_id == account.id
            )
        )

        assert account is not None
        assert passenger is not None
        assert passenger.first_name == "Ana"
        assert passenger.id_number == "1712345678"


def test_password_is_hashed(test_environment, signup_data):
    client, engine = test_environment

    response = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )

    assert response.status_code == 201

    with Session(engine) as db:
        account = db.get(
            Account,
            response.json()["accountId"],
        )

        assert account.password_hash != signup_data["password"]
        assert verify_password(
            signup_data["password"],
            account.password_hash,
        )


def test_duplicate_email(test_environment, signup_data):
    client, _ = test_environment

    first = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )

    second = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )

    assert first.status_code == 201
    assert second.status_code == 409


def test_duplicate_identification(test_environment, signup_data):
    client, _ = test_environment

    first = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )

    other_data = {
        **signup_data,
        "email": "otra@example.com",
    }

    second = client.post(
        "/api/v1/auth/signup",
        json=other_data,
    )

    assert first.status_code == 201
    assert second.status_code == 409


def test_password_mismatch(test_environment, signup_data):
    client, _ = test_environment

    invalid_data = {
        **signup_data,
        "confirmPassword": "OtraClave123!",
    }

    response = client.post(
        "/api/v1/auth/signup",
        json=invalid_data,
    )

    assert response.status_code == 422


def test_invalid_email(test_environment, signup_data):
    client, _ = test_environment

    invalid_data = {
        **signup_data,
        "email": "correo-invalido",
    }

    response = client.post(
        "/api/v1/auth/signup",
        json=invalid_data,
    )

    assert response.status_code == 422


def test_rollback_on_error(test_environment, signup_data):
    client, engine = test_environment

    # Simular un error durante la creación del pasajero.
    with patch(
        "app.modules.auth.service.create_passenger",
        side_effect=RuntimeError("Error simulado"),
    ):
        with pytest.raises(RuntimeError, match="Error simulado"):
            client.post(
                "/api/v1/auth/signup",
                json=signup_data,
            )

    # El administrador inicial debe permanecer, pero el registro fallido no crea datos.
    with Session(engine) as db:
        accounts = db.scalar(
            select(func.count()).select_from(Account)
        )

        passengers = db.scalar(
            select(func.count()).select_from(Passenger)
        )

        assert accounts == 1
        assert db.scalar(
            select(func.count())
            .select_from(Account)
            .where(Account.email == signup_data["email"])
        ) == 0
        assert passengers == 0
