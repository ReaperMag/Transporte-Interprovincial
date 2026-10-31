import io
import secrets

import segno


def generate_ticket_code() -> str:
    """
    Código único y aleatorio que va dentro del QR.
    No contiene datos del pasajero y no se puede adivinar.
    """
    return secrets.token_urlsafe(24)


def render_qr_png(code: str, scale: int = 8) -> bytes:
    """Imagen PNG del QR con el código del boleto, para el correo o el Wallet."""
    buffer = io.BytesIO()
    segno.make_qr(code, error="m").save(buffer, kind="png", scale=scale, border=2)
    return buffer.getvalue()
