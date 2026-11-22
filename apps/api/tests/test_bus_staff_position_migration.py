from sqlalchemy import create_engine, text

from app.core import database


def test_init_db_merges_driver_and_controller_into_bus_staff(monkeypatch):
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(
                text("CREATE TABLE staff (id INTEGER PRIMARY KEY, position VARCHAR(30))")
            )
            connection.execute(
                text(
                    "INSERT INTO staff (id, position) VALUES "
                    "(1, 'driver'), (2, 'controller'), (3, 'clerk'), (4, 'admin')"
                )
            )
        monkeypatch.setattr(database, "engine", engine)

        database.init_db()

        with engine.connect() as connection:
            positions = connection.execute(
                text("SELECT position FROM staff ORDER BY id")
            ).scalars().all()
        assert positions == ["bus_staff", "bus_staff", "clerk", "admin"]
    finally:
        engine.dispose()
