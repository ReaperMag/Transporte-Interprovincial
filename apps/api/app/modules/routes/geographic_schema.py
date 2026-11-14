from sqlalchemy import MetaData, inspect, text
from sqlalchemy.engine import Engine


_CITIES_UNIQUE_CONSTRAINT = "uq_cities_name_province_canton"


def ensure_geographic_schema(engine: Engine) -> None:
    """Adds geographic hierarchy columns and replaces the old uniqueness constraint."""
    inspector = inspect(engine)
    if "cities" not in inspector.get_table_names():
        return

    city_columns = inspector.get_columns("cities")
    columns = {column["name"] for column in city_columns}
    canton_nullable = next(
        (column["nullable"] for column in city_columns if column["name"] == "canton"),
        True,
    )
    with engine.begin() as connection:
        if "canton" not in columns:
            connection.execute(
                text("ALTER TABLE cities ADD COLUMN canton VARCHAR(100) NOT NULL DEFAULT ''")
            )
        else:
            connection.execute(text("UPDATE cities SET canton='' WHERE canton IS NULL"))
        if "is_catalogued" not in columns:
            catalogued_default = (
                "FALSE" if engine.dialect.name == "postgresql" else "0"
            )
            connection.execute(
                text(
                    "ALTER TABLE cities ADD COLUMN is_catalogued BOOLEAN NOT NULL "
                    f"DEFAULT {catalogued_default}"
                )
            )

    unique_constraints = inspect(engine).get_unique_constraints("cities")
    legacy_constraints = [
        constraint
        for constraint in unique_constraints
        if set(constraint["column_names"] or ()) == {"name", "province"}
    ]
    has_catalog_unique = any(
        set(constraint["column_names"] or ()) == {"name", "province", "canton"}
        for constraint in unique_constraints
    )
    if not legacy_constraints and has_catalog_unique and not canton_nullable:
        return

    if engine.dialect.name == "sqlite":
        _rebuild_sqlite_cities_table(engine)
        return
    if engine.dialect.name in {"postgresql", "mysql", "mariadb"}:
        _replace_named_unique_constraint(engine, legacy_constraints, has_catalog_unique)
        return
    raise RuntimeError(
        f"Geographic catalog migration is not supported for {engine.dialect.name}."
    )


def _rebuild_sqlite_cities_table(engine: Engine) -> None:
    from app.modules.routes.models import City

    replacement = City.__table__.to_metadata(MetaData(), name="cities_new")

    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        try:
            with connection.begin():
                replacement.create(connection)
                columns = [column.name for column in City.__table__.columns]
                names = ", ".join(f'"{column}"' for column in columns)
                selections = ", ".join(
                    "COALESCE(canton, '')" if column == "canton" else f'"{column}"'
                    for column in columns
                )
                connection.exec_driver_sql(
                    f"INSERT INTO cities_new ({names}) SELECT {selections} FROM cities"
                )
                connection.exec_driver_sql("DROP TABLE cities")
                connection.exec_driver_sql("ALTER TABLE cities_new RENAME TO cities")
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()


def _replace_named_unique_constraint(
    engine: Engine,
    legacy_constraints: list[dict],
    has_catalog_unique: bool,
) -> None:
    preparer = engine.dialect.identifier_preparer
    with engine.begin() as connection:
        for constraint in legacy_constraints:
            name = constraint.get("name")
            if not name:
                raise RuntimeError("The legacy cities uniqueness constraint has no name.")
            if engine.dialect.name in {"mysql", "mariadb"}:
                connection.execute(
                    text(f"ALTER TABLE cities DROP INDEX {preparer.quote(name)}")
                )
            else:
                connection.execute(
                    text(f"ALTER TABLE cities DROP CONSTRAINT {preparer.quote(name)}")
                )
        connection.execute(text("UPDATE cities SET canton='' WHERE canton IS NULL"))
        if engine.dialect.name in {"mysql", "mariadb"}:
            connection.execute(
                text("ALTER TABLE cities MODIFY canton VARCHAR(100) NOT NULL DEFAULT ''")
            )
        else:
            connection.execute(
                text("ALTER TABLE cities ALTER COLUMN canton SET NOT NULL")
            )
        if not has_catalog_unique:
            connection.execute(
                text(
                    f"ALTER TABLE cities ADD CONSTRAINT {_CITIES_UNIQUE_CONSTRAINT} "
                    "UNIQUE (name, province, canton)"
                )
            )
