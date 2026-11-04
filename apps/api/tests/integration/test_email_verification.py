from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import verify_password
from app.modules.accounts.repository import get_account_by_email
from app.modules.auth.models import VerificationCode, VerificationPurpose
from app.modules.auth.verification import utc_now


HEADERS = {"Origin": settings.frontend_origin}


def signup(client, signup_data):
    response = client.post("/api/v1/auth/signup", json=signup_data)
    assert response.status_code == 201, response.text
    return response


def verify(client, email, code):
    return client.post(
        "/api/v1/auth/verify-email",
        json={"email": email, "code": code},
        headers=HEADERS,
    )


def resend(client, email):
    return client.post(
        "/api/v1/auth/verify-email/resend",
        json={"email": email},
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


def verification_codes(engine, email) -> list[VerificationCode]:
    with Session(engine) as db:
        account = get_account_by_email(db, email)
        return list(
            db.scalars(
                select(VerificationCode)
                .where(VerificationCode.account_id == account.id)
                .order_by(VerificationCode.id)
            ).all()
        )


def move_codes_back(engine, email, **delta):
    """Simula el paso del tiempo moviendo hacia atrás las fechas de los códigos."""
    with Session(engine) as db:
        account = get_account_by_email(db, email)
        for code in db.scalars(
            select(VerificationCode).where(VerificationCode.account_id == account.id)
        ):
            code.created_at = code.created_at - timedelta(**delta)
            code.expires_at = code.expires_at - timedelta(**delta)
        db.commit()


def is_verified(engine, email) -> bool:
    with Session(engine) as db:
        return get_account_by_email(db, email).is_email_verified


def test_signup_leaves_the_account_pending_and_emails_a_hashed_code(
    test_environment, signup_data, fake_smtp
):
    client, engine = test_environment

    signup(client, signup_data)

    assert not is_verified(engine, signup_data["email"])
    messages = fake_smtp.sent_to(signup_data["email"])
    assert len(messages) == 1
    assert "Verifica tu cuenta" in messages[0]["Subject"]

    code = fake_smtp.last_code(signup_data["email"])
    [stored] = verification_codes(engine, signup_data["email"])
    assert stored.purpose == VerificationPurpose.EMAIL_VERIFICATION
    assert stored.code_hash != code
    assert code not in stored.code_hash
    assert verify_password(code, stored.code_hash)


def test_correct_code_verifies_the_account_and_allows_login(
    test_environment, signup_data, fake_smtp
):
    client, engine = test_environment
    signup(client, signup_data)

    response = verify(client, signup_data["email"], fake_smtp.last_code(signup_data["email"]))

    assert response.status_code == 200
    assert response.json()["message"] == "Tu correo fue verificado. Ya puedes iniciar sesión."
    assert is_verified(engine, signup_data["email"])
    assert login(client, signup_data["email"], signup_data["password"]).status_code == 200


def test_incorrect_code_is_rejected(test_environment, signup_data, fake_smtp):
    client, engine = test_environment
    signup(client, signup_data)
    code = fake_smtp.last_code(signup_data["email"])

    response = verify(client, signup_data["email"], wrong_code(code))

    assert response.status_code == 400
    assert response.json()["detail"] == "El código es incorrecto. Te quedan 4 intentos."
    assert not is_verified(engine, signup_data["email"])
    assert verification_codes(engine, signup_data["email"])[0].attempts == 1


def test_expired_code_is_rejected(test_environment, signup_data, fake_smtp):
    client, engine = test_environment
    signup(client, signup_data)
    code = fake_smtp.last_code(signup_data["email"])
    move_codes_back(engine, signup_data["email"], minutes=settings.verification_code_expire_minutes)

    response = verify(client, signup_data["email"], code)

    assert response.status_code == 400
    assert response.json()["detail"] == "El código no es válido o ya venció. Solicita uno nuevo."
    assert not is_verified(engine, signup_data["email"])


def test_code_is_revoked_after_five_failed_attempts(test_environment, signup_data, fake_smtp):
    client, engine = test_environment
    signup(client, signup_data)
    code = fake_smtp.last_code(signup_data["email"])

    for _ in range(4):
        assert verify(client, signup_data["email"], wrong_code(code)).status_code == 400
    fifth = verify(client, signup_data["email"], wrong_code(code))

    assert fifth.status_code == 400
    assert "Superaste el número de intentos" in fifth.json()["detail"]
    # Ni siquiera el código correcto sirve ya.
    assert verify(client, signup_data["email"], code).status_code == 400
    assert not is_verified(engine, signup_data["email"])


def test_used_code_cannot_be_used_again(test_environment, signup_data, fake_smtp):
    client, _ = test_environment
    signup(client, signup_data)
    code = fake_smtp.last_code(signup_data["email"])

    assert verify(client, signup_data["email"], code).status_code == 200
    assert verify(client, signup_data["email"], code).status_code == 400


def test_resend_waits_sixty_seconds_and_invalidates_the_previous_code(
    test_environment, signup_data, fake_smtp
):
    client, engine = test_environment
    signup(client, signup_data)
    first_code = fake_smtp.last_code(signup_data["email"])

    too_soon = resend(client, signup_data["email"])
    assert too_soon.status_code == 202
    assert len(fake_smtp.sent_to(signup_data["email"])) == 1

    move_codes_back(engine, signup_data["email"], seconds=61)
    after_wait = resend(client, signup_data["email"])

    assert after_wait.status_code == 202
    assert after_wait.json() == too_soon.json()
    assert len(fake_smtp.sent_to(signup_data["email"])) == 2
    new_code = fake_smtp.last_code(signup_data["email"])

    if new_code != first_code:
        assert verify(client, signup_data["email"], first_code).status_code == 400
    assert verify(client, signup_data["email"], new_code).status_code == 200


def test_resend_gives_the_same_answer_for_unknown_or_verified_emails(
    test_environment, signup_data, fake_smtp, verify_account
):
    client, _ = test_environment
    signup(client, signup_data)
    verify_account(signup_data["email"])
    sent_before = len(fake_smtp.outbox)

    unknown = resend(client, "nadie@example.com")
    verified = resend(client, signup_data["email"])

    assert unknown.status_code == verified.status_code == 202
    assert unknown.json() == verified.json()
    assert len(fake_smtp.outbox) == sent_before


def test_unverified_passenger_cannot_log_in(test_environment, signup_data, fake_smtp):
    client, _ = test_environment
    signup(client, signup_data)

    response = login(client, signup_data["email"], signup_data["password"])

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "email_not_verified"
    assert "no está verificada" in response.json()["detail"]["message"]
    assert settings.auth_cookie_name not in client.cookies


def test_wrong_password_does_not_reveal_that_the_account_is_unverified(
    test_environment, signup_data, fake_smtp
):
    client, _ = test_environment
    signup(client, signup_data)

    response = login(client, signup_data["email"], "ClaveIncorrecta123!")

    assert response.status_code == 401


def test_verification_endpoints_validate_the_origin(test_environment, signup_data):
    client, _ = test_environment

    response = client.post(
        "/api/v1/auth/verify-email",
        json={"email": signup_data["email"], "code": "123456"},
    )

    assert response.status_code == 403


def test_signup_succeeds_even_if_the_email_cannot_be_sent(
    test_environment, signup_data, fake_smtp
):
    client, engine = test_environment
    fake_smtp.fail = True

    signup(client, signup_data)

    assert fake_smtp.outbox == []
    assert len(verification_codes(engine, signup_data["email"])) == 1


def test_codes_expire_after_the_configured_minutes(test_environment, signup_data, fake_smtp):
    client, engine = test_environment
    before = utc_now()

    signup(client, signup_data)

    [stored] = verification_codes(engine, signup_data["email"])
    expires_at = stored.expires_at.replace(tzinfo=before.tzinfo)
    expected = before + timedelta(minutes=settings.verification_code_expire_minutes)
    assert abs(expires_at - expected) < timedelta(seconds=5)
