from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.pool import StaticPool

from app.modules.routes.geographic_schema import ensure_geographic_schema


def test_sqlite_geographic_migration_preserves_ids_and_foreign_keys():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE cities ("
                "id INTEGER NOT NULL PRIMARY KEY, "
                "name VARCHAR(100) NOT NULL, "
                "province VARCHAR(100) NOT NULL, "
                "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                "CONSTRAINT uq_legacy_city UNIQUE (name, province))"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE saved_routes ("
                "id INTEGER PRIMARY KEY, "
                "city_id INTEGER NOT NULL REFERENCES cities(id))"
            )
        )
        connection.execute(
            text(
                "INSERT INTO cities (id, name, province) VALUES "
                "(41, 'La Esperanza', 'Imbabura')"
            )
        )
        connection.execute(text("INSERT INTO saved_routes (id, city_id) VALUES (9, 41)"))

    ensure_geographic_schema(engine)
    ensure_geographic_schema(engine)

    with engine.begin() as connection:
        columns = {column["name"] for column in inspect(connection).get_columns("cities")}
        assert {"canton", "is_catalogued"} <= columns
        city = connection.execute(
            text(
                "SELECT id, name, province, canton, is_catalogued "
                "FROM cities WHERE id=41"
            )
        ).one()
        assert tuple(city) == (41, "La Esperanza", "Imbabura", "", 0)
        connection.execute(
            text(
                "INSERT INTO cities (name, province, canton, is_catalogued) VALUES "
                "('La Esperanza', 'Imbabura', 'Ibarra', 1), "
                "('La Esperanza', 'Imbabura', 'Pimampiro', 1)"
            )
        )
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        assert connection.execute(
            text("SELECT city_id FROM saved_routes WHERE id=9")
        ).scalar_one() == 41

    engine.dispose()
