from pathlib import Path

from pydantic import EmailStr, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


API_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = API_ROOT / ".env"


class Settings(BaseSettings):
    """Configuración de la aplicación mediante variables de entorno."""

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Transporte Interprovincial API"

    database_url: str = "sqlite:///./transporte.db"
    database_echo: bool = False
    admin_email: EmailStr | None = None
    admin_password: SecretStr | None = None

    # Autenticación JWT
    jwt_secret_key: str | None = None
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = Field(
        default=15,
        gt=0,
    )
    # Configuración de la cookie de autenticación
    auth_cookie_name: str = "access_token"
    auth_cookie_path: str = "/api/v1"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"

    # Origen permitido para solicitudes autenticadas en desarrollo
    frontend_origin: str = "http://localhost:5173"

    # Archivos subidos (comprobantes y documentos). La carpeta es relativa a apps/api.
    uploads_dir: str = "uploads"
    max_upload_size_mb: int = Field(default=5, gt=0)

    # Datos de pago de demostración que se muestran al comprar.
    # Son ficticios: no corresponden a una cuenta real.
    payment_bank_name: str = "Banco Pichincha"
    payment_account_type: str = "Ahorros"
    payment_account_number: str = "2200000000"
    payment_account_holder: str = "Transporte Interprovincial (demostración)"
    payment_deuna_qr: str = "DEMO-DEUNA-TRANSPORTE-INTERPROVINCIAL"


settings = Settings()