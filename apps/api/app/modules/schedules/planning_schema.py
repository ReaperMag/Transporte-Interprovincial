from sqlalchemy import Engine, inspect, text


def ensure_route_planning_schema(engine: Engine) -> None:
    """Agrega el grupo de la ruta y los buses en descanso sin perder datos."""
    inspector = inspect(engine)

    bus_group_columns = {
        column["name"] for column in inspector.get_columns("bus_groups")
    }
    with engine.begin() as connection:
        if "rest_buses_count" not in bus_group_columns:
            connection.execute(
                text(
                    "ALTER TABLE bus_groups ADD COLUMN rest_buses_count "
                    "INTEGER NOT NULL DEFAULT 1"
                )
            )

    route_columns = {column["name"] for column in inspect(engine).get_columns("routes")}
    with engine.begin() as connection:
        if "bus_group_id" not in route_columns:
            connection.execute(
                text(
                    "ALTER TABLE routes ADD COLUMN bus_group_id INTEGER "
                    "REFERENCES bus_groups(id) ON DELETE RESTRICT"
                )
            )

        indexes = {
            index["name"] for index in inspect(connection).get_indexes("routes")
        }
        if "idx_routes_bus_group_id" not in indexes:
            connection.execute(
                text("CREATE INDEX idx_routes_bus_group_id ON routes (bus_group_id)")
            )

        # Las rutas históricas adoptan el grupo de sus frecuencias cuando todas
        # pertenecen al mismo grupo.
        connection.execute(
            text(
                """
                UPDATE routes
                SET bus_group_id = (
                    SELECT MIN(frequencies.bus_group_id)
                    FROM frequencies
                    WHERE frequencies.route_id = routes.id
                )
                WHERE routes.bus_group_id IS NULL
                  AND EXISTS (
                    SELECT 1 FROM frequencies
                    WHERE frequencies.route_id = routes.id
                      AND frequencies.bus_group_id IS NOT NULL
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM frequencies
                    WHERE frequencies.route_id = routes.id
                      AND frequencies.bus_group_id IS NULL
                  )
                  AND (
                    SELECT COUNT(DISTINCT frequencies.bus_group_id)
                    FROM frequencies
                    WHERE frequencies.route_id = routes.id
                  ) = 1
                """
            )
        )
