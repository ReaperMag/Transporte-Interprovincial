from sqlalchemy import create_engine, inspect, text

from app.core import database


def test_init_db_adds_description_to_an_existing_cooperative_table(monkeypatch):
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE cooperatives "
                    "(id INTEGER PRIMARY KEY, name VARCHAR(150), ruc VARCHAR(13))"
                )
            )
            connection.execute(
                text(
                    "CREATE TABLE frequencies "
                    "(id INTEGER PRIMARY KEY, cooperative_id INTEGER, route_id INTEGER, "
                    "departure_time TIME, resolution_number VARCHAR(50), is_active BOOLEAN)"
                )
            )
        monkeypatch.setattr(database, "engine", engine)

        database.init_db()

        columns = {
            column["name"] for column in inspect(engine).get_columns("cooperatives")
        }
        assert "description" in columns
        frequency_columns = {
            column["name"] for column in inspect(engine).get_columns("frequencies")
        }
        assert "bus_group_id" in frequency_columns
    finally:
        engine.dispose()
