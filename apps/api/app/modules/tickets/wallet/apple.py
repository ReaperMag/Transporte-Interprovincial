
import hashlib
import io
import json
import re
import zipfile
from zoneinfo import ZoneInfo

from cryptography import x509
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs7

from app.modules.tickets.wallet.common import WalletTicketData


ECUADOR_TIMEZONE = ZoneInfo("America/Guayaquil")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class AppleWalletError(ValueError):
    """Error al preparar o firmar un pase de Apple Wallet."""


def build_apple_wallet_pass_json(
    ticket: WalletTicketData,
    *,
    pass_type_identifier: str,
    team_identifier: str,
    organization_name: str,
) -> dict:
    """Construye la información de un boleto de autobús para Apple Wallet."""

    if not re.fullmatch(r"pass\.[A-Za-z0-9.-]+", pass_type_identifier):
        raise AppleWalletError(
            "El identificador del tipo de pase de Apple no es válido."
        )

    if not re.fullmatch(r"[A-Z0-9]{10}", team_identifier):
        raise AppleWalletError(
            "El identificador del equipo de Apple no es válido."
        )

    if not organization_name.strip():
        raise AppleWalletError(
            "Debes indicar el nombre de la organización."
        )

    departure = ticket.departure_at

    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=ECUADOR_TIMEZONE)
    else:
        departure = departure.astimezone(ECUADOR_TIMEZONE)

    return {
        "formatVersion": 1,
        "passTypeIdentifier": pass_type_identifier,
        "serialNumber": f"ticket_{ticket.ticket_id}",
        "teamIdentifier": team_identifier,
        "organizationName": organization_name,
        "description": "Boleto de transporte interprovincial",
        "logoText": ticket.cooperative_name,
        "foregroundColor": "rgb(255, 255, 255)",
        "backgroundColor": "rgb(28, 63, 112)",
        "labelColor": "rgb(230, 235, 245)",
        "relevantDate": departure.isoformat(timespec="seconds"),
        "barcode": {
            "format": "PKBarcodeFormatQR",
            "message": ticket.qr_value,
            "messageEncoding": "iso-8859-1",
            "altText": f"Boleto #{ticket.ticket_id}",
        },
        "barcodes": [
            {
                "format": "PKBarcodeFormatQR",
                "message": ticket.qr_value,
                "messageEncoding": "iso-8859-1",
                "altText": f"Boleto #{ticket.ticket_id}",
            }
        ],
        "boardingPass": {
            "transitType": "PKTransitTypeBus",
            "primaryFields": [
                {
                    "key": "origin",
                    "label": "ORIGEN",
                    "value": ticket.origin_city,
                },
                {
                    "key": "destination",
                    "label": "DESTINO",
                    "value": ticket.destination_city,
                },
            ],
            "secondaryFields": [
                {
                    "key": "passenger",
                    "label": "PASAJERO",
                    "value": ticket.passenger_name,
                },
                {
                    "key": "departure",
                    "label": "SALIDA",
                    "value": departure.strftime("%d/%m/%Y %H:%M"),
                },
            ],
            "auxiliaryFields": [
                {
                    "key": "seat",
                    "label": "ASIENTO",
                    "value": str(ticket.seat_number),
                },
                {
                    "key": "bus",
                    "label": "BUS",
                    "value": ticket.bus_number,
                },
            ],
        },
    }


def create_apple_wallet_pass(
    ticket: WalletTicketData,
    *,
    pass_type_identifier: str,
    team_identifier: str,
    organization_name: str,
    signing_certificate_pem: bytes,
    private_key_pem: bytes,
    wwdr_certificate_pem: bytes,
    icon_png: bytes,
    icon_2x_png: bytes,
    private_key_password: bytes | None = None,
) -> bytes:
    """
    Genera un archivo .pkpass firmado.

    Los certificados y la clave privada deben proporcionarse
    desde una configuración segura, nunca desde el frontend.
    """

    pass_data = build_apple_wallet_pass_json(
        ticket,
        pass_type_identifier=pass_type_identifier,
        team_identifier=team_identifier,
        organization_name=organization_name,
    )

    if not icon_png.startswith(PNG_SIGNATURE):
        raise AppleWalletError("icon.png debe ser una imagen PNG.")

    if not icon_2x_png.startswith(PNG_SIGNATURE):
        raise AppleWalletError("icon@2x.png debe ser una imagen PNG.")

    try:
        signing_certificate = x509.load_pem_x509_certificate(
            signing_certificate_pem
        )

        wwdr_certificate = x509.load_pem_x509_certificate(
            wwdr_certificate_pem
        )

        private_key = serialization.load_pem_private_key(
            private_key_pem,
            password=private_key_password,
        )

        certificate_public_key = signing_certificate.public_key().public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

        private_public_key = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

        if certificate_public_key != private_public_key:
            raise AppleWalletError(
                "La clave privada no corresponde al certificado del pase."
            )

    except (ValueError, TypeError, UnsupportedAlgorithm) as exc:
        raise AppleWalletError(
            "No se pudieron cargar los certificados de Apple Wallet."
        ) from exc

    files = {
        "pass.json": json.dumps(
            pass_data,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8"),
        "icon.png": icon_png,
        "icon@2x.png": icon_2x_png,
    }

    manifest = {
        filename: hashlib.sha1(content).hexdigest()
        for filename, content in sorted(files.items())
    }

    manifest_bytes = json.dumps(
        manifest,
        separators=(",", ":"),
    ).encode("utf-8")

    try:
        signature = (
            pkcs7.PKCS7SignatureBuilder()
            .set_data(manifest_bytes)
            .add_signer(
                signing_certificate,
                private_key,
                hashes.SHA256(),
            )
            .add_certificate(wwdr_certificate)
            .sign(
                serialization.Encoding.DER,
                [
                    pkcs7.PKCS7Options.DetachedSignature,
                    pkcs7.PKCS7Options.Binary,
                ],
            )
        )
    except (ValueError, TypeError, UnsupportedAlgorithm) as exc:
        raise AppleWalletError(
            "No se pudo firmar el pase de Apple Wallet."
        ) from exc

    buffer = io.BytesIO()

    with zipfile.ZipFile(
        buffer,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive:
        for filename, content in files.items():
            archive.writestr(filename, content)

        archive.writestr("manifest.json", manifest_bytes)
        archive.writestr("signature", signature)

    return buffer.getvalue()
