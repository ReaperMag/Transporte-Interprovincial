
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import jwt

from app.modules.tickets.wallet.common import WalletTicketData


GOOGLE_WALLET_SAVE_URL = "https://pay.google.com/gp/v/save/"
GOOGLE_WALLET_TIMEZONE = ZoneInfo("America/Guayaquil")


class GoogleWalletError(ValueError):
    """Error al preparar o firmar un pase de Google Wallet."""


def localized(value: str) -> dict:
    return {
        "defaultValue": {
            "language": "es-EC",
            "value": value,
        }
    }


def build_google_wallet_object(
    ticket: WalletTicketData,
    issuer_id: str,
    class_suffix: str = "interprovincial_ticket",
) -> dict:
    """Construye el objeto de Google Wallet a partir de un boleto."""

    if not issuer_id.isdigit():
        raise GoogleWalletError("El identificador del emisor no es válido.")

    if not re.fullmatch(r"[A-Za-z0-9_-]+", class_suffix):
        raise GoogleWalletError("El identificador de la clase no es válido.")

    departure = ticket.departure_at

    if departure.tzinfo is not None:
        departure = departure.astimezone(GOOGLE_WALLET_TIMEZONE)

    departure_text = departure.strftime("%d/%m/%Y %H:%M")

    return {
        "id": f"{issuer_id}.ticket_{ticket.ticket_id}",
        "classId": f"{issuer_id}.{class_suffix}",
        "state": "ACTIVE",
        "cardTitle": localized(ticket.cooperative_name),
        "header": localized(
            f"{ticket.origin_city} - {ticket.destination_city}"
        ),
        "subheader": localized("Boleto interprovincial"),
        "barcode": {
            "type": "QR_CODE",
            "value": ticket.qr_value,
        },
        "textModulesData": [
            {
                "id": "passenger",
                "header": "Pasajero",
                "body": ticket.passenger_name,
            },
            {
                "id": "seat_bus",
                "header": "Asiento / Bus",
                "body": f"{ticket.seat_number} / {ticket.bus_number}",
            },
            {
                "id": "departure",
                "header": "Fecha de salida",
                "body": departure_text,
            },
        ],
    }


def create_google_wallet_url(
    ticket: WalletTicketData,
    *,
    issuer_id: str,
    service_account_email: str,
    private_key: str,
    class_suffix: str = "interprovincial_ticket",
) -> str:
    """Genera un enlace de Google Wallet firmado con RS256."""

    if not service_account_email or not private_key:
        raise GoogleWalletError(
            "Faltan las credenciales de Google Wallet."
        )

    wallet_object = build_google_wallet_object(
        ticket,
        issuer_id=issuer_id,
        class_suffix=class_suffix,
    )

    now = int(datetime.now(timezone.utc).timestamp())

    claims = {
        "iss": service_account_email,
        "aud": "google",
        "typ": "savetowallet",
        "iat": now,
        "exp": now + 600,
        "origins": [],
        "payload": {
            "genericObjects": [wallet_object],
        },
    }

    try:
        signed_token = jwt.encode(
            claims,
            private_key,
            algorithm="RS256",
        )
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise GoogleWalletError(
            "No se pudo firmar el pase de Google Wallet."
        ) from exc

    if len(signed_token) > 1800:
        raise GoogleWalletError(
            "El pase supera el tamaño recomendado para el enlace."
        )

    return f"{GOOGLE_WALLET_SAVE_URL}{signed_token}"
