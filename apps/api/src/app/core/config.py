from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


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

    # Autenticación JWT
    jwt_secret_key: str | None = None
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = Field(
        default=15,
        gt=0,
    )


settings = Settings()