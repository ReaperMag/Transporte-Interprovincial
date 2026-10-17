from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    echo=settings.database_echo,
    # SQLite no permite por defecto usar la conexión desde varios hilos (FastAPI sí lo hace).
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


if _is_sqlite:

    @event.listens_for(Engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
        # SQLite ignora las claves foráneas si no se activan en cada conexión.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_db() -> Generator[Session, None, None]:
    """Dependencia de FastAPI: entrega una sesión y la cierra al terminar la petición."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
