from sqlalchemy import create_engine, inspect, text

from app.core.database import ensure_bus_catalog_columns


def test_catalog_reference_migration_preserves_existing_buses(tmp_path):
    database_path = tmp_path / "legacy_buses.db"
    engine = create_engine(f"sqlite:///{database_path}")

    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE chassis_brands (id INTEGER PRIMARY KEY)")
        )

        connection.execute(
            text("CREATE TABLE bodywork_brands (id INTEGER PRIMARY KEY)")
        )

        connection.execute(
            text(
                "CREATE TABLE buses ("
                "id INTEGER PRIMARY KEY, "
                "brand VARCHAR(50)"
                ")"
            )
        )

        connection.execute(
            text(
                "INSERT INTO buses (id, brand) "
                "VALUES (1, 'Hino')"
            )
        )

    # Ejecutar dos veces para comprobar que no duplica columnas.
    ensure_bus_catalog_columns(engine)
    ensure_bus_catalog_columns(engine)

    columns = {
        column["name"]
        for column in inspect(engine).get_columns("buses")
    }

    assert "chassis_brand_id" in columns
    assert "bodywork_brand_id" in columns

    with engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT brand, chassis_brand_id, bodywork_brand_id "
                "FROM buses WHERE id = 1"
            )
        ).one()

    assert tuple(row) == ("Hino", None, None)

    engine.dispose()
