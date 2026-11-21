from sqlalchemy import create_engine, inspect, text

from app.core import database


def test_init_db_adds_the_payment_review_columns(monkeypatch):
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
                    "INSERT INTO cooperatives (id, name, ruc) "
                    "VALUES (1, 'Andina', '1790000000001')"
                )
            )
            connection.execute(
                text(
                    "CREATE TABLE reservations "
                    "(id INTEGER PRIMARY KEY, trip_id INTEGER, status VARCHAR(30), "
                    "expires_at DATETIME)"
                )
            )
        monkeypatch.setattr(database, "engine", engine)

        database.init_db()

        cooperative_columns = {
            column["name"] for column in inspect(engine).get_columns("cooperatives")
        }
        reservation_columns = {
            column["name"] for column in inspect(engine).get_columns("reservations")
        }
        assert "payment_review_timeout_minutes" in cooperative_columns
        assert {"review_expires_at", "review_alert_sent_at"} <= reservation_columns
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT payment_review_timeout_minutes FROM cooperatives")
            ).scalar_one() == 30
    finally:
        engine.dispose()
