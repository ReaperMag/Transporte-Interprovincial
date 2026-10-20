from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt

from app.core.config import settings


class InvalidTokenError(Exception):
    """Indica que un token JWT es inválido o ha expirado."""


def get_jwt_secret() -> str:
    """Obtiene y valida la clave de firma JWT."""

    secret = settings.jwt_secret_key

    if not secret or len(secret.encode("utf-8")) < 32:
        raise RuntimeError(
            "JWT_SECRET_KEY debe contener al menos 32 bytes."
        )

    return secret


def create_access_token(
    account_id: int,
    account_type: str,
) -> str:
    """Genera un JWT de acceso para una cuenta autenticada."""

    if account_id <= 0:
        raise ValueError("El identificador de cuenta debe ser positivo.")

    if account_type != "passenger":
        raise ValueError("Solo se permite autenticación de pasajeros.")

    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(account_id),
        "account_type": account_type,
        "iat": now,
        "exp": now + timedelta(
            minutes=settings.jwt_access_token_expire_minutes
        ),
        "iss": "transporte-interprovincial",
        "jti": str(uuid4()),
    }

    return jwt.encode(
        payload,
        get_jwt_secret(),
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict:
    """Valida la firma, vigencia y contenido del JWT."""

    try:
        payload = jwt.decode(
            token,
            get_jwt_secret(),
            algorithms=["HS256"],
            issuer="transporte-interprovincial",
            options={
                "require": [
                    "sub",
                    "account_type",
                    "iat",
                    "exp",
                    "iss",
                    "jti",
                ],
            },
        )

        account_id = int(payload["sub"])

        if account_id <= 0:
            raise InvalidTokenError("Token inválido.")

        if payload["account_type"] != "passenger":
            raise InvalidTokenError("Token inválido.")

        return payload

    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError) as error:
        raise InvalidTokenError(
            "Token inválido o expirado."
        ) from error