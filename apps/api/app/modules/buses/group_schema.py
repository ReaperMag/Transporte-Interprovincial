from sqlalchemy import Engine, inspect, text

from app.modules.buses.group_names import normalize_group_name


def ensure_bus_group_name_index(engine: Engine) -> None:
    columns = {
        column["name"] for column in inspect(engine).get_columns("bus_groups")
    }

    with engine.begin() as connection:
        if "normalized_name" not in columns:
            connection.execute(
                text("ALTER TABLE bus_groups ADD COLUMN normalized_name VARCHAR(100)")
            )
            rows = connection.execute(
                text("SELECT id, cooperative_id, name FROM bus_groups ORDER BY id")
            ).all()
            normalized_names: dict[tuple[int, str], int] = {}
            for group_id, cooperative_id, name in rows:
                normalized = normalize_group_name(name)
                key = (cooperative_id, normalized)
                previous_id = normalized_names.get(key)
                if previous_id is not None:
                    raise RuntimeError(
                        "No se puede migrar bus_groups: los grupos "
                        f"{previous_id} y {group_id} tienen nombres duplicados "
                        "en la misma cooperativa ignorando mayúsculas y espacios."
                    )
                normalized_names[key] = group_id
                connection.execute(
                    text(
                        "UPDATE bus_groups SET normalized_name = :normalized "
                        "WHERE id = :id"
                    ),
                    {"normalized": normalized, "id": group_id},
                )

        indexes = {
            index["name"] for index in inspect(connection).get_indexes("bus_groups")
        }
        if "uq_bus_groups_cooperative_normalized_name" not in indexes:
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX "
                    "uq_bus_groups_cooperative_normalized_name "
                    "ON bus_groups (cooperative_id, normalized_name)"
                )
            )
