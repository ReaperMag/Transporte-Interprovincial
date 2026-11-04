import re

from app.modules.auth.verification import generate_code
from app.modules.notifications.templates.emails import (
    password_reset_code_email,
    verification_code_email,
)


def test_codes_have_six_digits():
    codes = {generate_code() for _ in range(200)}

    assert all(re.fullmatch(r"\d{6}", code) for code in codes)
    # Son aleatorios: en 200 códigos prácticamente no se repiten.
    assert len(codes) > 190


def test_verification_email_contains_the_code_and_its_expiration():
    content = verification_code_email("012345", 15)

    assert content.subject == "Verifica tu cuenta - Transporte Interprovincial"
    assert "Código: 012345" in content.text
    assert "15 minutos" in content.text
    assert "012345" in content.html


def test_password_reset_email_is_different_from_verification():
    content = password_reset_code_email("987654", 10)

    assert content.subject == "Recupera tu contraseña - Transporte Interprovincial"
    assert "Código: 987654" in content.text
    assert "10 minutos" in content.text
