
from app.core.config import settings


def test_login_success(test_environment, signup_data):
    client, _ = test_environment

    signup = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )
    assert signup.status_code == 201

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": signup_data["email"],
            "password": signup_data["password"],
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 200
    assert response.json()["email"] == signup_data["email"]
    assert response.json()["accountType"] == "passenger"
    assert settings.auth_cookie_name in client.cookies
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "password" not in response.json()
    assert response.headers["cache-control"] == "no-store"


def test_login_invalid_password(test_environment, signup_data):
    client, _ = test_environment

    client.post("/api/v1/auth/signup", json=signup_data)

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": signup_data["email"],
            "password": "ClaveIncorrecta123!",
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 401
    assert settings.auth_cookie_name not in client.cookies


def test_login_rejects_missing_origin(test_environment, signup_data):
    client, _ = test_environment

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": signup_data["email"],
            "password": signup_data["password"],
        },
    )

    assert response.status_code == 403


def test_me_without_login(test_environment):
    client, _ = test_environment

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401


def test_me_after_login(test_environment, signup_data):
    client, _ = test_environment

    client.post("/api/v1/auth/signup", json=signup_data)

    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": signup_data["email"],
            "password": signup_data["password"],
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert login.status_code == 200

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json()["accountId"] == login.json()["accountId"]


def test_logout(test_environment, signup_data):
    client, _ = test_environment

    client.post("/api/v1/auth/signup", json=signup_data)

    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": signup_data["email"],
            "password": signup_data["password"],
        },
        headers={"Origin": settings.frontend_origin},
    )

    assert login.status_code == 200

    logout = client.post(
        "/api/v1/auth/logout",
        headers={"Origin": settings.frontend_origin},
    )

    assert logout.status_code == 204
    assert settings.auth_cookie_name not in client.cookies

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 401

def test_login_blocks_after_five_failed_attempts(
    test_environment,
    signup_data,
):
    client, _ = test_environment

    signup = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )
    assert signup.status_code == 201

    credentials = {
        "email": signup_data["email"],
        "password": "ClaveIncorrecta123!",
    }

    headers = {"Origin": settings.frontend_origin}

    # Los primeros cinco intentos fallan normalmente.
    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login",
            json=credentials,
            headers=headers,
        )

        assert response.status_code == 401

    # El sexto intento es bloqueado.
    response = client.post(
        "/api/v1/auth/login",
        json=credentials,
        headers=headers,
    )

    assert response.status_code == 429


def test_login_blocks_correct_password_after_limit(
    test_environment,
    signup_data,
):
    client, _ = test_environment

    signup = client.post(
        "/api/v1/auth/signup",
        json=signup_data,
    )
    assert signup.status_code == 201

    headers = {"Origin": settings.frontend_origin}

    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": signup_data["email"],
                "password": "Incorrecta123!",
            },
            headers=headers,
        )

        assert response.status_code == 401

    # Aunque la contraseña sea correcta, sigue bloqueado.
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": signup_data["email"],
            "password": signup_data["password"],
        },
        headers=headers,
    )

    assert response.status_code == 429
    assert settings.auth_cookie_name not in client.cookies


def test_failed_attempts_do_not_reveal_registered_emails(
    test_environment,
):
    client, _ = test_environment

    headers = {"Origin": settings.frontend_origin}

    credentials = {
        "email": "desconocido@example.com",
        "password": "ClaveIncorrecta123!",
    }

    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login",
            json=credentials,
            headers=headers,
        )

        assert response.status_code == 401
        assert response.json()["detail"] == (
            "Correo o contraseña incorrectos."
        )

    response = client.post(
        "/api/v1/auth/login",
        json=credentials,
        headers=headers,
    )

    assert response.status_code == 429
