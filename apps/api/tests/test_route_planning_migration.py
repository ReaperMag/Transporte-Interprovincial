from sqlalchemy import create_engine, inspect, text

from app.core import database


def test_init_db_adds_route_group_and_rest_buses_columns(monkeypatch):
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE bus_groups ("
                    "id INTEGER PRIMARY KEY, cooperative_id INTEGER, "
                    "name VARCHAR(100), normalized_name VARCHAR(100), "
                    "description VARCHAR(255))"
                )
            )
            connection.execute(
                text(
                    "CREATE TABLE routes ("
                    "id INTEGER PRIMARY KEY, cooperative_id INTEGER, "
                    "origin_city_id INTEGER, destination_city_id INTEGER, "
                    "route_type VARCHAR(30), duration_minutes INTEGER, "
                    "is_active BOOLEAN)"
                )
            )
            connection.execute(
                text(
                    "CREATE TABLE frequencies ("
                    "id INTEGER PRIMARY KEY, cooperative_id INTEGER, route_id INTEGER, "
                    "bus_group_id INTEGER, departure_time TIME, "
                    "resolution_number VARCHAR(50), is_active BOOLEAN)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO bus_groups (id, cooperative_id, name, normalized_name) "
                    "VALUES (1, 10, 'Interprovincial', 'interprovincial')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO bus_groups (id, cooperative_id, name, normalized_name) "
                    "VALUES (2, 10, 'Cantonal', 'cantonal')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO routes (id, cooperative_id, origin_city_id, "
                    "destination_city_id, route_type, duration_minutes, is_active) "
                    "VALUES (1, 10, 1, 2, 'direct', 180, 1), (2, 10, 1, 2, 'direct', 120, 1)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO frequencies (id, cooperative_id, route_id, bus_group_id, "
                    "departure_time, resolution_number, is_active) VALUES "
                    "(1, 10, 1, 1, '08:00', 'ANT-1', 1), "
                    "(2, 10, 1, 1, '12:00', 'ANT-2', 1), "
                    "(3, 10, 2, 1, '09:00', 'ANT-3', 1), "
                    "(4, 10, 2, 2, '10:00', 'ANT-4', 1)"
                )
            )
        monkeypatch.setattr(database, "engine", engine)

        database.init_db()

        bus_group_columns = {
            column["name"] for column in inspect(engine).get_columns("bus_groups")
        }
        route_columns = {
            column["name"] for column in inspect(engine).get_columns("routes")
        }
        assert "rest_buses_count" in bus_group_columns
        assert "bus_group_id" in route_columns

        with engine.connect() as connection:
            rest_counts = connection.execute(
                text("SELECT id, rest_buses_count FROM bus_groups ORDER BY id")
            ).all()
            route_groups = connection.execute(
                text("SELECT id, bus_group_id FROM routes ORDER BY id")
            ).all()
        assert rest_counts == [(1, 1), (2, 1)]
        # La ruta 1 tiene un único grupo; la ruta 2 mezcla grupos y queda sin asignar.
        assert route_groups == [(1, 1), (2, None)]
    finally:
        engine.dispose()
