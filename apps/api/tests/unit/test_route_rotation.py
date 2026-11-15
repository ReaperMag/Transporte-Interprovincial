from datetime import date, time, timedelta
from types import SimpleNamespace

from app.modules.schedules import rotation


def build_bus(bus_id: int, *, status: str = "operativo", active: bool = True):
    return SimpleNamespace(
        id=bus_id,
        number=f"{bus_id:02}",
        status=status,
        is_active=active,
    )


def build_frequency(
    frequency_id: int,
    hour: int,
    minute: int = 0,
    *,
    origin: int = 1,
    destination: int = 2,
    duration: int | None = 60,
):
    route = SimpleNamespace(
        origin_city_id=origin,
        destination_city_id=destination,
        duration_minutes=duration,
    )
    return SimpleNamespace(
        id=frequency_id,
        departure_time=time(hour, minute),
        route=route,
    )


def test_monday_and_tuesday_start_with_different_buses():
    buses = [build_bus(index) for index in range(1, 5)]
    frequencies = [build_frequency(1, 8)]

    monday = rotation.build_daily_plan(buses, frequencies, date(2025, 1, 6), 0)
    tuesday = rotation.build_daily_plan(buses, frequencies, date(2025, 1, 7), 0)

    assert monday.assignments[0].bus_id == buses[0].id
    assert tuesday.assignments[0].bus_id == buses[1].id


def test_standby_bus_rotates_daily_and_restarts_the_cycle():
    buses = [build_bus(index) for index in range(1, 5)]
    days = [date(2025, 1, 6) + timedelta(days=index) for index in range(5)]

    standby = [
        [bus.id for bus in rotation.select_standby_buses(buses, day, 1)] for day in days
    ]

    assert standby == [[1], [2], [3], [4], [1]]


def test_no_resting_buses_when_rest_count_is_zero():
    buses = [build_bus(index) for index in range(1, 4)]

    assert rotation.select_standby_buses(buses, date(2025, 1, 6), 0) == []


def test_insufficient_fleet_reports_warnings():
    buses = [build_bus(1), build_bus(2)]
    frequencies = [build_frequency(1, 8), build_frequency(2, 9)]

    plan = rotation.build_daily_plan(buses, frequencies, date(2025, 1, 6), 1)

    assert len(plan.standby_buses) == 1
    assert [assignment.bus_id for assignment in plan.assignments].count(None) == 1
    assert rotation.UNASSIGNED_FREQUENCIES in plan.warnings
    assert rotation.NO_SPARE_BUSES in plan.warnings


def test_rest_count_is_clamped_and_flagged():
    buses = [build_bus(1), build_bus(2)]

    plan = rotation.build_daily_plan(buses, [build_frequency(1, 8)], date(2025, 1, 6), 5)

    assert len(plan.standby_buses) == 1
    assert rotation.REST_COUNT_TOO_HIGH in plan.warnings
    assert rotation.NO_REST_BUSES in plan.warnings


def test_conflict_leaves_frequency_without_a_bus():
    buses = [build_bus(1), build_bus(2)]
    frequencies = [
        build_frequency(1, 8, 0, duration=120),
        build_frequency(2, 8, 10, duration=120),
        build_frequency(3, 8, 20, duration=120),
    ]

    plan = rotation.build_daily_plan(buses, frequencies, date(2025, 1, 6), 0)

    assert plan.assignments[2].bus_id is None
    assert rotation.UNASSIGNED_FREQUENCIES in plan.warnings


def test_bus_cannot_start_from_another_city_on_the_same_day():
    buses = [build_bus(1)]
    frequencies = [
        build_frequency(1, 8, origin=1, destination=2),
        build_frequency(2, 10, origin=3, destination=4),
    ]

    plan = rotation.build_daily_plan(buses, frequencies, date(2025, 1, 6), 0)

    assert plan.assignments[0].bus_id == 1
    assert plan.assignments[1].bus_id is None


def test_non_operational_buses_are_excluded():
    buses = [
        build_bus(1, status="mantenimiento"),
        build_bus(2, status="operativo"),
    ]

    plan = rotation.build_daily_plan(buses, [build_frequency(1, 8)], date(2025, 1, 6), 0)

    assert plan.assignments[0].bus_id == 2


def test_no_operational_buses_warning():
    buses = [build_bus(1, status="fuera_de_servicio")]

    plan = rotation.build_daily_plan(buses, [build_frequency(1, 8)], date(2025, 1, 6), 1)

    assert plan.warnings == [rotation.NO_OPERATIONAL_BUSES]
    assert plan.assignments == []


def test_starting_locations_match_first_assignment():
    buses = [build_bus(1), build_bus(2)]
    frequencies = [
        build_frequency(1, 8, origin=5, destination=6),
        build_frequency(2, 10, origin=6, destination=5),
    ]

    plan = rotation.build_daily_plan(buses, frequencies, date(2025, 1, 6), 0)

    first_bus = plan.assignments[0].bus_id
    second_bus = plan.assignments[1].bus_id
    assert plan.starting_locations[first_bus] == 5
    assert plan.starting_locations[second_bus] == 6
