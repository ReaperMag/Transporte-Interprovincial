from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

ANCHOR_MONDAY = date(2025, 1, 6)
BUS_TURNAROUND_MINUTES = 30

NO_OPERATIONAL_BUSES = "NO_OPERATIONAL_BUSES"
REST_COUNT_TOO_HIGH = "REST_COUNT_TOO_HIGH"
NO_SPARE_BUSES = "NO_SPARE_BUSES"
NO_REST_BUSES = "NO_REST_BUSES"
UNASSIGNED_FREQUENCIES = "UNASSIGNED_FREQUENCIES"


@dataclass(frozen=True)
class RotationAssignment:
    frequency_id: int
    bus_id: int | None
    departure_time: time
    origin_city_id: int
    destination_city_id: int
    duration_minutes: int


@dataclass(frozen=True)
class DailyPlan:
    assignments: list[RotationAssignment] = field(default_factory=list)
    starting_locations: dict[int, int] = field(default_factory=dict)
    standby_buses: list = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def day_index(service_date: date) -> int:
    return (service_date - ANCHOR_MONDAY).days


def _is_operational(bus) -> bool:
    return bool(bus.is_active) and bus.status == "operativo"


def select_standby_buses(buses: list, service_date: date, rest_count: int) -> list:
    if not buses:
        return []
    effective = min(max(rest_count, 0), len(buses) - 1)
    if effective == 0:
        return []
    start = (day_index(service_date) * effective) % len(buses)
    return [buses[(start + index) % len(buses)] for index in range(effective)]


def build_daily_plan(
    buses: list,
    frequencies: list,
    service_date: date,
    rest_count: int,
) -> DailyPlan:
    warnings: list[str] = []
    operational = sorted(
        (bus for bus in buses if _is_operational(bus)),
        key=lambda bus: (bus.number, bus.id),
    )
    if not operational:
        return DailyPlan(warnings=[NO_OPERATIONAL_BUSES])

    requested_rest = max(rest_count, 0)
    if requested_rest >= len(operational):
        warnings.append(REST_COUNT_TOO_HIGH)
    effective_rest = min(requested_rest, len(operational) - 1)
    standby = select_standby_buses(operational, service_date, effective_rest)
    if len(standby) < requested_rest:
        warnings.append(NO_REST_BUSES)

    standby_ids = {bus.id for bus in standby}
    working = [bus for bus in operational if bus.id not in standby_ids]
    rotation = working
    if working:
        offset = day_index(service_date) % len(working)
        rotation = working[offset:] + working[:offset]

    ordered = sorted(frequencies, key=lambda item: (item.departure_time, item.id))
    last_arrival: dict[int, datetime] = {}
    last_destination: dict[int, int] = {}
    first_origin: dict[int, int] = {}
    used_bus_ids: set[int] = set()
    assignments: list[RotationAssignment] = []
    pointer = 0

    for frequency in ordered:
        route = frequency.route
        duration = route.duration_minutes
        departure = datetime.combine(service_date, frequency.departure_time)
        assigned_bus = None
        if duration is not None and rotation:
            for step in range(len(rotation)):
                index = (pointer + step) % len(rotation)
                candidate = rotation[index]
                previous_arrival = last_arrival.get(candidate.id)
                fits = previous_arrival is None or (
                    departure
                    >= previous_arrival + timedelta(minutes=BUS_TURNAROUND_MINUTES)
                    and last_destination.get(candidate.id) == route.origin_city_id
                )
                if fits:
                    assigned_bus = candidate
                    pointer = (index + 1) % len(rotation)
                    break

        if assigned_bus is not None:
            last_arrival[assigned_bus.id] = departure + timedelta(minutes=duration)
            last_destination[assigned_bus.id] = route.destination_city_id
            first_origin.setdefault(assigned_bus.id, route.origin_city_id)
            used_bus_ids.add(assigned_bus.id)

        assignments.append(
            RotationAssignment(
                frequency_id=frequency.id,
                bus_id=assigned_bus.id if assigned_bus is not None else None,
                departure_time=frequency.departure_time,
                origin_city_id=route.origin_city_id,
                destination_city_id=route.destination_city_id,
                duration_minutes=duration or 0,
            )
        )

    if any(assignment.bus_id is None for assignment in assignments):
        warnings.append(UNASSIGNED_FREQUENCIES)
    if working and len(used_bus_ids) == len(working):
        warnings.append(NO_SPARE_BUSES)

    return DailyPlan(
        assignments=assignments,
        starting_locations=first_origin,
        standby_buses=standby,
        warnings=warnings,
    )
