from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración de la aplicación leída desde variables de entorno o el archivo .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Transporte Interprovincial API"
    database_url: str = "sqlite:///./transporte.db"
    database_echo: bool = False
    allow_unauthenticated_admin: bool = False


settings = Settings()
