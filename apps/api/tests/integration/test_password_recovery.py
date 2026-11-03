from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.accounts.repository import get_account_by_email
from app.modules.auth.models import VerificationCode


HEADERS = {"Origin": settings.frontend_origin}
NEW_PASSWORD = "NuevaClave456!"


def forgot(client, email):
    return client.post(
        "/api/v1/auth/password/forgot",
        json={"email": email},
        headers=HEADERS,
    )


def reset(client, email, code, password=NEW_PASSWORD, confirm=None):
    return client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": email,
            "code": code,
            "password": password,
            "confirmPassword": password if confirm is None else confirm,
        },
        headers=HEADERS,
    )


def login(client, email, password):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers=HEADERS,
    )


def wrong_code(code: str) -> str:
    return "000000" if code != "000000" else "111111"


def register_verified(client, signup_data, verify_account):
    assert client.post("/api/v1/auth/signup", json=signup_data).status_code == 201
    verify_account(signup_data["email"])


def test_forgot_password_gives_the_same_answer_for_unknown_emails(
    test_environment, signup_data, fake_smtp, verify_account
):
    client, _ = test_environment
    register_verified(client, signup_data, verify_account)
    sent_before = len(fake_smtp.outbox)

    unknown = forgot(client, "nadie@example.com")
    known = forgot(client, signup_data["email"])

    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert fake_smtp.sent_to("nadie@example.com") == []
    assert len(fake_smtp.outbox) == sent_before + 1


def test_password_is_reset_with_a_valid_code(
    test_environment, signup_data, fake_smtp, verify_account
):
    client, engine = test_environment
    register_verified(client, signup_data, verify_account)
    forgot(client, signup_data["email"])
    message = fake_smtp.sent_to(signup_data["email"])[-1]
    assert "Recupera tu contraseña" in message["Subject"]
    code = fake_smtp.last_code(signup_data["email"])

    response = reset(client, signup_data["email"], code)

    assert response.status_code == 200
    assert login(client, signup_data["email"], signup_data["password"]).status_code == 401
    assert login(client, signup_data["email"], NEW_PASSWORD).status_code == 200
    with Session(engine) as db:
        account = get_account_by_email(db, signup_data["email"])
        assert account.password_hash.startswith("$argon2id$")
    # El código quedó usado.
    assert reset(client, signup_data["email"], code, "OtraClave789!").status_code == 400


def test_reset_rejects_an_incorrect_code(
    test_environment, signup_data, fake_smtp, verify_account
):
    client, _ = test_environment
    register_verified(client, signup_data, verify_account)
    forgot(client, signup_data["email"])
    code = fake_smtp.last_code(signup_data["email"])

    response = reset(client, signup_data["email"], wrong_code(code))

    assert response.status_code == 400
    assert login(client, signup_data["email"], signup_data["password"]).status_code == 200


def test_reset_rejects_an_expired_code(
    test_environment, signup_data, fake_smtp, verify_account
):
    client, engine = test_environment
    register_verified(client, signup_data, verify_account)
    forgot(client, signup_data["email"])
    code = fake_smtp.last_code(signup_data["email"])
    with Session(engine) as db:
        for stored in db.scalars(select(VerificationCode)):
            stored.expires_at = stored.expires_at - timedelta(
                minutes=settings.verification_code_expire_minutes
            )
        db.commit()

    assert reset(client, signup_data["email"], code).status_code == 400


def test_reset_respects_the_failed_login_lockout(
    test_environment, signup_data, fake_smtp, verify_account
):
    client, _ = test_environment
    register_verified(client, signup_data, verify_account)
    forgot(client, signup_data["email"])
    code = fake_smtp.last_code(signup_data["email"])

    for _ in range(5):
        assert reset(client, signup_data["email"], wrong_code(code)).status_code == 400

    blocked = reset(client, signup_data["email"], code)
    assert blocked.status_code == 429
    assert login(client, signup_data["email"], signup_data["password"]).status_code == 429


def test_reset_applies_the_signup_password_policy(
    test_environment, signup_data, fake_smtp, verify_account
):
    client, _ = test_environment
    register_verified(client, signup_data, verify_account)
    forgot(client, signup_data["email"])
    code = fake_smtp.last_code(signup_data["email"])

    assert reset(client, signup_data["email"], code, "corta").status_code == 422
    assert reset(client, signup_data["email"], code, NEW_PASSWORD, "Distinta123!").status_code == 422
    assert reset(client, signup_data["email"], code).status_code == 200


def test_forgot_password_waits_sixty_seconds_between_codes(
    test_environment, signup_data, fake_smtp, verify_account
):
    client, _ = test_environment
    register_verified(client, signup_data, verify_account)
    sent_before = len(fake_smtp.outbox)

    first = forgot(client, signup_data["email"])
    second = forgot(client, signup_data["email"])

    assert first.json() == second.json()
    assert len(fake_smtp.outbox) == sent_before + 1


def test_reset_also_verifies_a_pending_account(test_environment, signup_data, fake_smtp):
    client, _ = test_environment
    assert client.post("/api/v1/auth/signup", json=signup_data).status_code == 201
    forgot(client, signup_data["email"])
    code = fake_smtp.last_code(signup_data["email"])

    assert reset(client, signup_data["email"], code).status_code == 200
    assert login(client, signup_data["email"], NEW_PASSWORD).status_code == 200
