
from pathlib import Path

from app.core.config import API_ROOT, Settings, settings
from app.modules.tickets.schemas import TicketRead
from app.modules.tickets.wallet.apple import (
    AppleWalletError,
    create_apple_wallet_pass,
)
from app.modules.tickets.wallet.common import build_wallet_ticket_data
from app.modules.tickets.wallet.google import (
    GoogleWalletError,
    create_google_wallet_url,
)


class WalletConfigurationError(Exception):
    """La integración de Wallet no está configurada correctamente."""


def _required(value: str | None) -> str:
    if not value or not value.strip():
        raise WalletConfigurationError(
            "Falta configurar una credencial de Wallet."
        )
    return value.strip()


def _read_file(path: str | None) -> bytes:
    """Lee archivos de configuración únicamente desde el backend."""

    file_path = Path(_required(path)).expanduser()

    if not file_path.is_absolute():
        file_path = API_ROOT / file_path

    try:
        return file_path.read_bytes()
    except OSError as exc:
        raise WalletConfigurationError(
            "No se pudo leer un archivo de configuración de Wallet."
        ) from exc


def build_google_wallet_link(
    ticket: TicketRead,
    config: Settings = settings,
) -> str:
    """Prepara el enlace firmado de Google Wallet."""

    data = build_wallet_ticket_data(ticket)

    issuer_id = _required(config.google_wallet_issuer_id)
    email = _required(config.google_wallet_service_account_email)

    try:
        private_key = _read_file(
            config.google_wallet_private_key_path
        ).decode("utf-8")

        return create_google_wallet_url(
            data,
            issuer_id=issuer_id,
            service_account_email=email,
            private_key=private_key,
            class_suffix=config.google_wallet_class_suffix,
        )

    except (GoogleWalletError, UnicodeDecodeError) as exc:
        raise WalletConfigurationError(
            "No se pudo preparar Google Wallet."
        ) from exc


def build_apple_wallet_file(
    ticket: TicketRead,
    config: Settings = settings,
) -> bytes:
    """Genera el archivo .pkpass del boleto."""

    data = build_wallet_ticket_data(ticket)

    pass_type_identifier = _required(
        config.apple_wallet_pass_type_identifier
    )

    team_identifier = _required(
        config.apple_wallet_team_identifier
    )

    organization_name = _required(
        config.apple_wallet_organization_name
    )

    password = config.apple_wallet_private_key_password

    password_bytes = (
        password.get_secret_value().encode("utf-8")
        if password is not None
        else None
    )

    try:
        return create_apple_wallet_pass(
            data,
            pass_type_identifier=pass_type_identifier,
            team_identifier=team_identifier,
            organization_name=organization_name,
            signing_certificate_pem=_read_file(
                config.apple_wallet_signing_certificate_path
            ),
            private_key_pem=_read_file(
                config.apple_wallet_private_key_path
            ),
            wwdr_certificate_pem=_read_file(
                config.apple_wallet_wwdr_certificate_path
            ),
            icon_png=_read_file(
                config.apple_wallet_icon_path
            ),
            icon_2x_png=_read_file(
                config.apple_wallet_icon_2x_path
            ),
            private_key_password=password_bytes,
        )

    except AppleWalletError as exc:
        raise WalletConfigurationError(
            "No se pudo preparar Apple Wallet."
        ) from exc
