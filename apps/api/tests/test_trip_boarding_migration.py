from sqlalchemy import create_engine, inspect, text

from app.core import database


def test_init_db_adds_the_boarding_columns(monkeypatch):
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE trips "
                    "(id INTEGER PRIMARY KEY, bus_id INTEGER, status VARCHAR(30))"
                )
            )
            connection.execute(
                text(
                    "CREATE TABLE tickets "
                    "(id INTEGER PRIMARY KEY, code VARCHAR(64), status VARCHAR(30))"
                )
            )
        monkeypatch.setattr(database, "engine", engine)

        database.init_db()

        inspector = inspect(engine)
        trip_columns = {column["name"] for column in inspector.get_columns("trips")}
        ticket_columns = {column["name"] for column in inspector.get_columns("tickets")}
        assert {"boarding_started_at", "boarding_started_by_id"} <= trip_columns
        assert "rejection_reason" in ticket_columns
        assert "trip_problems" in inspector.get_table_names()
    finally:
        engine.dispose()
