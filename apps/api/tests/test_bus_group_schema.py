import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import import_models
from app.modules.buses.group_schema import ensure_bus_group_name_index
from app.modules.buses.models import BusGroup
from app.modules.cooperatives.models import Cooperative
from app.shared.base_model import Base


def test_bus_group_names_are_normalized_and_unique_per_cooperative():
    import_models()
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)

    try:
        with Session(engine) as db:
            first_cooperative = Cooperative(
                name="Primera cooperativa",
                ruc="1234567890001",
            )
            second_cooperative = Cooperative(
                name="Segunda cooperativa",
                ruc="1234567890002",
            )
            db.add_all([first_cooperative, second_cooperative])
            db.flush()
            db.add(
                BusGroup(
                    cooperative_id=first_cooperative.id,
                    name="  Rutas   Largas ",
                )
            )
            db.commit()
            first = db.scalar(text("SELECT name FROM bus_groups"))
            assert first == "Rutas Largas"

            db.add(
                BusGroup(
                    cooperative_id=first_cooperative.id,
                    name="rutas largas",
                )
            )
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()

            db.add(
                BusGroup(
                    cooperative_id=second_cooperative.id,
                    name="rutas largas",
                )
            )
            db.commit()
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_bus_group_name_index_is_added_to_existing_database():
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE bus_groups "
                    "(id INTEGER PRIMARY KEY, cooperative_id INTEGER NOT NULL, "
                    "name VARCHAR(100) NOT NULL, description VARCHAR(255))"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO bus_groups (id, cooperative_id, name) "
                    "VALUES (1, 7, ' Rutas   Largas ')"
                )
            )

        ensure_bus_group_name_index(engine)

        with engine.connect() as connection:
            assert connection.scalar(
                text("SELECT normalized_name FROM bus_groups WHERE id = 1")
            ) == "rutas largas"
        indexes = {
            index["name"] for index in inspect(engine).get_indexes("bus_groups")
        }
        assert "uq_bus_groups_cooperative_normalized_name" in indexes
    finally:
        engine.dispose()


def test_bus_group_name_migration_refuses_duplicates_without_losing_data():
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE bus_groups "
                    "(id INTEGER PRIMARY KEY, cooperative_id INTEGER NOT NULL, "
                    "name VARCHAR(100) NOT NULL, description VARCHAR(255))"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO bus_groups (id, cooperative_id, name) VALUES "
                    "(1, 7, 'Rutas largas'), (2, 7, ' RUTAS   LARGAS ')"
                )
            )

        with pytest.raises(RuntimeError, match="nombres duplicados"):
            ensure_bus_group_name_index(engine)

        with engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM bus_groups")) == 2
    finally:
        engine.dispose()
