"""
Códigos de 6 dígitos para verificar la cuenta y recuperar la contraseña.

Los códigos se guardan con Argon2, igual que las contraseñas. Solo el
código más reciente de cada propósito es válido, vence a los
VERIFICATION_CODE_EXPIRE_MINUTES y admite hasta 5 intentos.
"""

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.modules.accounts.models import Account
from app.modules.auth.models import VerificationCode, VerificationPurpose
from app.modules.notifications.providers.smtp import send_email
from app.modules.notifications.templates.emails import (
    password_reset_code_email,
    verification_code_email,
)


MAX_CODE_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60
CODE_DIGITS = 6


class InvalidVerificationCodeError(Exception):
    """El código es incorrecto, venció, ya se usó o agotó sus intentos."""


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    # SQLite devuelve las fechas sin zona horaria; se guardan en UTC.
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def generate_code() -> str:
    """Código numérico aleatorio y criptográficamente seguro."""
    return f"{secrets.randbelow(10**CODE_DIGITS):0{CODE_DIGITS}d}"


def _latest_code(
    db: Session,
    account_id: int,
    purpose: VerificationPurpose,
) -> VerificationCode | None:
    return db.scalar(
        select(VerificationCode)
        .where(
            VerificationCode.account_id == account_id,
            VerificationCode.purpose == purpose,
        )
        .order_by(VerificationCode.created_at.desc(), VerificationCode.id.desc())
        .limit(1)
    )


def can_issue_code(
    db: Session,
    account: Account,
    purpose: VerificationPurpose,
    now: datetime | None = None,
) -> bool:
    """Indica si ya pasó la espera mínima desde el último código enviado."""
    now = now or utc_now()
    latest = _latest_code(db, account.id, purpose)
    if latest is None:
        return True
    elapsed = now - _as_utc(latest.created_at)
    return elapsed >= timedelta(seconds=RESEND_COOLDOWN_SECONDS)


def issue_code(
    db: Session,
    account: Account,
    purpose: VerificationPurpose,
    now: datetime | None = None,
) -> str:
    """
    Genera un código nuevo e invalida los anteriores del mismo propósito.

    Devuelve el código en texto plano para enviarlo por correo; en la base
    solo queda su hash. No confirma la transacción.
    """
    now = now or utc_now()

    db.execute(
        update(VerificationCode)
        .where(
            VerificationCode.account_id == account.id,
            VerificationCode.purpose == purpose,
            VerificationCode.used_at.is_(None),
            VerificationCode.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )

    code = generate_code()
    db.add(
        VerificationCode(
            account_id=account.id,
            purpose=purpose,
            code_hash=hash_password(code),
            expires_at=now + timedelta(minutes=settings.verification_code_expire_minutes),
            created_at=now,
        )
    )
    db.flush()
    return code


def consume_code(
    db: Session,
    account: Account,
    purpose: VerificationPurpose,
    code: str,
    now: datetime | None = None,
) -> None:
    """
    Valida el código y lo marca como usado.

    Un intento fallido se guarda de inmediato. Al llegar a 5 intentos el
    código se revoca. Si el código es correcto, no confirma la transacción:
    lo hace quien llama junto con el cambio que autoriza el código.
    """
    now = now or utc_now()
    record = _latest_code(db, account.id, purpose)

    if (
        record is None
        or record.used_at is not None
        or record.revoked_at is not None
        or _as_utc(record.expires_at) <= now
    ):
        raise InvalidVerificationCodeError(
            "El código no es válido o ya venció. Solicita uno nuevo."
        )

    if not verify_password(code, record.code_hash):
        record.attempts += 1
        remaining = MAX_CODE_ATTEMPTS - record.attempts
        if remaining <= 0:
            record.revoked_at = now
        db.commit()

        if remaining <= 0:
            raise InvalidVerificationCodeError(
                "Superaste el número de intentos permitidos. Solicita un nuevo código."
            )
        raise InvalidVerificationCodeError(
            f"El código es incorrecto. Te quedan {remaining} intentos."
            if remaining != 1
            else "El código es incorrecto. Te queda 1 intento."
        )

    record.used_at = now


def send_code_email(email: str, purpose: VerificationPurpose, code: str) -> bool:
    """Envía el código por correo. Si falla, solo se registra en el log."""
    minutes = settings.verification_code_expire_minutes
    content = (
        verification_code_email(code, minutes)
        if purpose == VerificationPurpose.EMAIL_VERIFICATION
        else password_reset_code_email(code, minutes)
    )
    return send_email(email, content)
