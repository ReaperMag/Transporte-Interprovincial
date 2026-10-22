
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.login_attempts.models import LoginFailedAttempt


MAX_FAILED_ATTEMPTS = 5
ATTEMPT_WINDOW_MINUTES = 15


def _identity_key(value: str, purpose: str) -> str:
    """Genera un identificador HMAC para no guardar datos directamente."""

    secret = settings.jwt_secret_key

    if not secret or len(secret.encode("utf-8")) < 32:
        raise RuntimeError(
            "JWT_SECRET_KEY debe tener al menos 32 bytes."
        )

    message = f"{purpose}:{value}".encode("utf-8")

    return hmac.new(
        secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


def _get_keys(email: str, ip_address: str) -> tuple[str, str]:
    """Normaliza los identificadores del intento."""

    normalized_email = email.strip().casefold()
    normalized_ip = ip_address.strip()

    return (
        _identity_key(normalized_email, "login-email"),
        _identity_key(normalized_ip, "login-ip"),
    )


def count_recent_failed_attempts(
    db: Session,
    email: str,
    ip_address: str,
    now: datetime | None = None,
) -> int:
    """Cuenta los fallos de una combinación correo/IP en 15 minutos."""

    if now is None:
        now = datetime.now(timezone.utc)

    cutoff = now - timedelta(minutes=ATTEMPT_WINDOW_MINUTES)

    email_key, ip_key = _get_keys(email, ip_address)

    query = (
        select(func.count())
        .select_from(LoginFailedAttempt)
        .where(
            LoginFailedAttempt.email_key == email_key,
            LoginFailedAttempt.ip_key == ip_key,
            LoginFailedAttempt.attempted_at > cutoff,
            LoginFailedAttempt.attempted_at <= now,
        )
    )

    return int(db.scalar(query) or 0)


def is_login_blocked(
    db: Session,
    email: str,
    ip_address: str,
    now: datetime | None = None,
) -> bool:
    """Indica si se alcanzó el límite permitido de fallos."""

    attempts = count_recent_failed_attempts(
        db,
        email,
        ip_address,
        now,
    )

    return attempts >= MAX_FAILED_ATTEMPTS


def register_failed_login(
    db: Session,
    email: str,
    ip_address: str,
    now: datetime | None = None,
) -> None:
    """Guarda un intento fallido de forma persistente."""

    if now is None:
        now = datetime.now(timezone.utc)

    email_key, ip_key = _get_keys(email, ip_address)

    attempt = LoginFailedAttempt(
        email_key=email_key,
        ip_key=ip_key,
        attempted_at=now,
    )

    db.add(attempt)
    db.commit()
