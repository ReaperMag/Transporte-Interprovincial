from collections.abc import Generator
from importlib import import_module
from pathlib import Path

from sqlalchemy import create_engine, event, inspect, make_url, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import API_ROOT, settings
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
    "app.modules.login_attempts.models",
)

_is_sqlite = settings.database_url.startswith("sqlite")

_database_url = make_url(settings.database_url)
if (
    _database_url.drivername.startswith("sqlite")
    and _database_url.database not in (None, "", ":memory:")
):
    _database_path = Path(_database_url.database)
    if not _database_path.is_absolute():
        _database_path = (API_ROOT / _database_path).resolve()
        _database_url = _database_url.set(database=str(_database_path))

engine = create_engine(
    _database_url,
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
    """Crea las tablas que aún no existen y aplica cambios aditivos de esquema."""
    import_models()
    Base.metadata.create_all(bind=engine)
    columns = {
        column["name"] for column in inspect(engine).get_columns("cooperatives")
    }
    if "description" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE cooperatives ADD COLUMN description VARCHAR(1000)")
            )


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
