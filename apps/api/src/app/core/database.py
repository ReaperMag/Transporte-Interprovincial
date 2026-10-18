from collections.abc import Generator
from importlib import import_module

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.shared.base_model import Base

# Módulos que definen entidades. Al importarlos, sus tablas se registran en Base.metadata.
MODEL_MODULES = (
    "app.modules.roles_permissions.models",
    "app.modules.cooperatives.models",
    "app.modules.accounts.models",
    "app.modules.staff.models",
    "app.modules.passengers.models",
    "app.modules.buses.models",
    "app.modules.routes.models",
    "app.modules.schedules.models",
    "app.modules.trips.models",
    "app.modules.reservations.models",
    "app.modules.sales.models",
    "app.modules.tickets.models",
    "app.modules.notifications.models",
)

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


def import_models() -> None:
    for module in MODEL_MODULES:
        import_module(module)


def init_db() -> None:
    """Crea las tablas que aún no existen."""
    import_models()
    Base.metadata.create_all(bind=engine)


def reset_db() -> None:
    """Borra todas las tablas y las vuelve a crear. Se pierden todos los datos."""
    import_models()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Dependencia de FastAPI: entrega una sesión y la cierra al terminar la petición."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
