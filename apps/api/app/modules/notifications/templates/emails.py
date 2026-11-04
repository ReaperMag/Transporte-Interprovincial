"""Plantillas de los correos que envía el sistema, en texto plano y HTML."""

from html import escape

from app.modules.notifications.providers.smtp import EmailContent


SYSTEM_NAME = "Transporte Interprovincial"
FOOTER = f"Este es un mensaje automático de {SYSTEM_NAME}. No respondas a este correo."


def _render(subject: str, title: str, paragraphs: list[str], code: str | None = None) -> EmailContent:
    text_parts = [title, "", *paragraphs]
    if code is not None:
        text_parts += ["", f"Código: {code}"]
    text_parts += ["", "--", FOOTER]

    html_paragraphs = "".join(
        f'<p style="margin:0 0 12px;line-height:1.5">{escape(paragraph)}</p>'
        for paragraph in paragraphs
    )
    html_code = (
        '<p style="margin:20px 0;font-size:28px;font-weight:700;letter-spacing:8px;'
        f'color:#0e5a6b">{escape(code)}</p>'
        if code is not None
        else ""
    )
    html = (
        '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;'
        'color:#14212b;background:#f5f4f0;padding:24px;border-radius:8px">'
        '<p style="margin:0 0 20px;color:#d99a1e;font-size:12px;font-weight:700;'
        f'letter-spacing:2px">{escape(SYSTEM_NAME.upper())}</p>'
        f'<h1 style="margin:0 0 16px;font-size:22px">{escape(title)}</h1>'
        f"{html_paragraphs}{html_code}"
        '<p style="margin:24px 0 0;color:#5b6670;font-size:12px">'
        f"{escape(FOOTER)}</p></div>"
    )

    return EmailContent(
        subject=f"{subject} - {SYSTEM_NAME}",
        text="\n".join(text_parts),
        html=html,
    )


def verification_code_email(code: str, expire_minutes: int) -> EmailContent:
    """Correo con el código para verificar la cuenta recién registrada."""
    return _render(
        "Verifica tu cuenta",
        "Verifica tu correo electrónico",
        [
            "Gracias por registrarte. Ingresa este código en la aplicación para activar tu cuenta.",
            f"El código vence en {expire_minutes} minutos. Si no creaste esta cuenta, ignora este correo.",
        ],
        code,
    )


def password_reset_code_email(code: str, expire_minutes: int) -> EmailContent:
    """Correo con el código para establecer una nueva contraseña."""
    return _render(
        "Recupera tu contraseña",
        "Recuperación de contraseña",
        [
            "Recibimos una solicitud para cambiar la contraseña de tu cuenta. "
            "Ingresa este código en la aplicación para crear una nueva.",
            f"El código vence en {expire_minutes} minutos. Si no lo solicitaste, ignora este "
            "correo: tu contraseña actual sigue siendo válida.",
        ],
        code,
    )


def notification_email(title: str, message: str) -> EmailContent:
    """Correo con el mismo título y mensaje de una notificación de la aplicación."""
    return _render(
        title,
        title,
        [message, "Puedes revisar el detalle en la aplicación."],
    )
