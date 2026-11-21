from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.roles_permissions.seed import COOPERATIVE_ADMIN_ROLE, ensure_default_roles
from app.modules.tickets.generator import generate_ticket_code
from app.modules.tickets.models import SaleChannel, Ticket, TicketStatus
from app.modules.trips.models import Trip
from test_bus_staff_trips import (  # noqa: F401
    DRIVER,
    ORIGIN,
    PASSWORD,
    TRIPS_URL,
    bus_trip,
    login,
    now,
    payments,
    regular_ticket,
    scenario,
    senior_ticket,
    start_boarding,
    validate,
)


@pytest.fixture
def finished_trip(bus_trip):
    """
    Viaje terminado: un pasajero abordó, otro fue rechazado por categoría,
    hubo una venta a bordo y un problema reportado.
    """
    client, engine, data = bus_trip
    boarded = regular_ticket(client, engine, data)
    rejected = senior_ticket(client, engine, data)
    start_boarding(client, data)
    validate(client, data, boarded.code)
    client.post(
        f"{TRIPS_URL}/{data['trip_id']}/tickets/{rejected.id}/reject-category",
        headers=ORIGIN,
    )
    client.post(f"{TRIPS_URL}/{data['trip_id']}/start", headers=ORIGIN)
    client.post(
        f"{TRIPS_URL}/{data['trip_id']}/problems",
        json={"problemType": "delay", "comment": "Retraso por neblina."},
        headers=ORIGIN,
    )
    with Session(engine) as db:
        trip = db.get(Trip, data["trip_id"])
        staff_id = trip.started_by_id
        db.add(
            Ticket(
                code=generate_ticket_code(),
                trip_id=trip.id,
                seat_id=data["seats"][1],
                passenger_id=boarded.passenger_id,
                channel=SaleChannel.ON_BOARD,
                origin_city_id=data["latacunga"],
                destination_city_id=data["loja"],
                passenger_category="regular",
                price=Decimal("12.50"),
                status=TicketStatus.USED,
                sold_by_id=staff_id,
                boarding_description="Salcedo",
                destination_description="Terminal de Loja",
            )
        )
        db.commit()
    finished = client.post(f"{TRIPS_URL}/{data['trip_id']}/finish", headers=ORIGIN)
    assert finished.status_code == 200, finished.text
    with Session(engine) as db:
        trip = db.get(Trip, data["trip_id"])
        trip.finished_at = trip.started_at + timedelta(hours=5, minutes=30)
        db.commit()
    return client, engine, data


def create_cooperative_admin(engine, cooperative_id: int) -> None:
    with Session(engine) as db:
        db.add(
            Account(
                email="admin@andina.ec",
                password_hash=hash_password(PASSWORD),
                account_type=AccountType.COOPERATIVE,
                cooperative_id=cooperative_id,
                role_id=ensure_default_roles(db)[COOPERATIVE_ADMIN_ROLE].id,
            )
        )
        db.commit()


# ---------------------------------------------------------------------------
# Reporte del viaje
# ---------------------------------------------------------------------------


def test_trip_report_shows_schedule_passengers_totals_and_problems(finished_trip):
    client, _, data = finished_trip
    login(client, DRIVER)

    response = client.get(f"{TRIPS_URL}/{data['trip_id']}/report")

    assert response.status_code == 200, response.text
    report = response.json()
    assert report["status"] == "finished"
    assert report["originCityName"] == "Quito"
    assert report["busNumber"] == "12"
    assert report["durationMinutes"] == 330
    assert report["startedByName"] == "Carlos Conductor"
    assert report["passengers"] == {
        "ticketsSold": 2,
        "boarded": 1,
        "noShow": 0,
        "rejected": 1,
        "onboardSales": 1,
    }
    assert Decimal(report["totals"]["onBoard"]) == Decimal("12.50")
    assert Decimal(report["totals"]["total"]) == (
        Decimal(report["totals"]["online"])
        + Decimal(report["totals"]["office"])
        + Decimal("12.50")
    )
    assert Decimal(report["totals"]["office"]) > 0
    assert [sale["boardingDescription"] for sale in report["onboardSales"]] == ["Salcedo"]
    assert report["onboardSales"][0]["soldByName"] == "Carlos Conductor"
    assert [problem["comment"] for problem in report["problems"]] == ["Retraso por neblina."]


def test_passengers_who_did_not_board_are_counted(bus_trip):
    client, engine, data = bus_trip
    regular_ticket(client, engine, data)
    start_boarding(client, data)
    client.post(f"{TRIPS_URL}/{data['trip_id']}/start", headers=ORIGIN)

    report = client.get(f"{TRIPS_URL}/{data['trip_id']}/report").json()

    assert report["passengers"]["noShow"] == 1
    assert report["passengers"]["boarded"] == 0
    assert report["durationMinutes"] is None


def test_report_is_available_from_boarding(bus_trip):
    client, _, data = bus_trip
    login(client, DRIVER)

    assert client.get(f"{TRIPS_URL}/{data['trip_id']}/report").status_code == 409
    start_boarding(client, data)
    assert client.get(f"{TRIPS_URL}/{data['trip_id']}/report").status_code == 200


def test_trip_report_downloads_as_pdf(finished_trip):
    client, _, data = finished_trip
    login(client, DRIVER)

    response = client.get(f"{TRIPS_URL}/{data['trip_id']}/report/pdf")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert f"reporte-viaje-{data['trip_id']}.pdf" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


# ---------------------------------------------------------------------------
# Historial del bus
# ---------------------------------------------------------------------------


def test_bus_history_lists_its_trips_with_a_summary(finished_trip):
    client, engine, data = finished_trip
    with Session(engine) as db:
        original = db.get(Trip, data["trip_id"])
        db.add(
            Trip(
                cooperative_id=original.cooperative_id,
                frequency_id=original.frequency_id,
                bus_id=original.bus_id,
                template_id=original.template_id,
                departure_at=now() + timedelta(days=3),
            )
        )
        db.commit()
    login(client, DRIVER)

    response = client.get("/api/v1/bus-staff/history")

    assert response.status_code == 200, response.text
    history = response.json()
    assert history["busNumber"] == "12"
    assert [trip["tripId"] for trip in history["trips"]] == [data["trip_id"]]
    item = history["trips"][0]
    assert item["passengersBoarded"] == 1
    assert item["onboardSales"] == 1
    assert item["openProblems"] == 1


# ---------------------------------------------------------------------------
# Acceso de la cooperativa
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("email", ["oficina@andina.ec", "admin@andina.ec"])
def test_cooperative_reads_reports_of_its_buses(finished_trip, email):
    client, engine, data = finished_trip
    with Session(engine) as db:
        trip = db.get(Trip, data["trip_id"])
        create_cooperative_admin(engine, trip.cooperative_id)
        bus_id = trip.bus_id
    login(client, email)

    report = client.get(f"/api/v1/cooperatives/me/trips/{data['trip_id']}/report")
    pdf = client.get(f"/api/v1/cooperatives/me/trips/{data['trip_id']}/report/pdf")
    history = client.get(f"/api/v1/cooperatives/me/buses/{bus_id}/history")

    assert report.status_code == 200, report.text
    assert report.json()["tripId"] == data["trip_id"]
    assert pdf.content.startswith(b"%PDF")
    assert history.status_code == 200, history.text
    assert len(history.json()["trips"]) == 1


def test_other_cooperative_cannot_read_the_reports(finished_trip):
    client, engine, data = finished_trip
    with Session(engine) as db:
        bus_id = db.get(Trip, data["trip_id"]).bus_id
    login(client, "oficina@costa.ec")

    assert client.get(
        f"/api/v1/cooperatives/me/trips/{data['trip_id']}/report"
    ).status_code == 404
    assert client.get(f"/api/v1/cooperatives/me/buses/{bus_id}/history").status_code == 404


def test_passenger_cannot_read_reports(finished_trip):
    client, _, data = finished_trip
    login(client, "ana@example.com")

    assert client.get(
        f"/api/v1/cooperatives/me/trips/{data['trip_id']}/report"
    ).status_code == 403
    assert client.get(f"{TRIPS_URL}/{data['trip_id']}/report").status_code == 403


def test_report_times_are_in_ecuador_local_time(finished_trip):
    client, _, data = finished_trip
    login(client, DRIVER)

    report = client.get(f"{TRIPS_URL}/{data['trip_id']}/report").json()

    reported_at = datetime.fromisoformat(report["problems"][0]["reportedAt"])
    sold_at = datetime.fromisoformat(report["onboardSales"][0]["soldAt"])
    for value in (reported_at, sold_at):
        assert value.utcoffset() == timedelta(hours=-5)
        assert abs(value - now()) < timedelta(minutes=5)
