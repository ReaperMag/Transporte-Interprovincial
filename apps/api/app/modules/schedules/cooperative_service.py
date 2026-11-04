from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.buses.models import Bus, BusGroup, BusStatus
from app.modules.reservations.models import Reservation
from app.modules.routes.models import City, Route, RouteStop
from app.modules.schedules.cooperative_schemas import (
    FrequencyCreate,
    RouteSheetSave,
)
from app.modules.schedules.models import (
    Frequency,
    RouteSheetMode,
    RouteSheet,
    RouteSheetBusLocation,
    RouteSheetStatus,
)
from app.modules.trips.models import Trip, TripStatus


LOCAL_TIMEZONE = ZoneInfo("America/Guayaquil")
BUS_TURNAROUND_MINUTES = 30


class BusGroupNotFoundError(Exception):
    pass


class RouteNotFoundError(Exception):
    pass


class RouteNotSchedulableError(Exception):
    pass


class DuplicateFrequencyError(Exception):
    pass


class FrequencyNotFoundError(Exception):
    pass


class RouteSheetNotFoundError(Exception):
    pass


class RouteSheetPublishedError(Exception):
    pass


class RouteSheetHasReservationsError(Exception):
    pass


class BusAssignmentError(Exception):
    pass


def _frequency_read(frequency: Frequency) -> dict:
    route = frequency.route
    stops = sorted(route.stops, key=lambda stop: stop.stop_order)
    route_name = f"{route.origin_city.name} - {route.destination_city.name}"
    return {
        "id": frequency.id,
        "route_id": route.id,
        "bus_group_id": frequency.bus_group_id,
        "departure_time": frequency.departure_time,
        "resolution_number": frequency.resolution_number,
        "route_name": route_name,
        "duration_minutes": route.duration_minutes,
        "stops": [stop.city.name for stop in stops],
    }


def list_frequencies(
    db: Session,
    cooperative_id: int,
    bus_group_id: int | None = None,
) -> list[dict]:
    statement = (
        select(Frequency)
        .join(Route, Frequency.route_id == Route.id)
        .options(
            selectinload(Frequency.route).selectinload(Route.origin_city),
            selectinload(Frequency.route).selectinload(Route.destination_city),
            selectinload(Frequency.route)
            .selectinload(Route.stops)
            .selectinload(RouteStop.city),
        )
        .where(
            Frequency.cooperative_id == cooperative_id,
            Route.cooperative_id == cooperative_id,
            Frequency.bus_group_id.is_not(None),
            Frequency.is_active.is_(True),
            Route.is_active.is_(True),
        )
        .order_by(Frequency.departure_time, Frequency.id)
    )
    if bus_group_id is not None:
        statement = statement.where(Frequency.bus_group_id == bus_group_id)
    return [_frequency_read(frequency) for frequency in db.scalars(statement).all()]


def create_frequency(
    db: Session,
    cooperative_id: int,
    payload: FrequencyCreate,
) -> dict:
    group = db.scalar(
        select(BusGroup).where(
            BusGroup.id == payload.bus_group_id,
            BusGroup.cooperative_id == cooperative_id,
        )
    )
    if group is None:
        raise BusGroupNotFoundError

    route = db.scalar(
        select(Route)
        .options(
            selectinload(Route.origin_city),
            selectinload(Route.destination_city),
            selectinload(Route.stops).selectinload(RouteStop.city),
        )
        .where(
            Route.id == payload.route_id,
            Route.cooperative_id == cooperative_id,
            Route.is_active.is_(True),
        )
    )
    if route is None:
        raise RouteNotFoundError
    if route.duration_minutes is None:
        raise RouteNotSchedulableError
    duplicate = db.scalar(
        select(Frequency.id).where(
            Frequency.cooperative_id == cooperative_id,
            Frequency.bus_group_id == group.id,
            Frequency.route_id == route.id,
            Frequency.departure_time == payload.departure_time,
            Frequency.is_active.is_(True),
        )
    )
    if duplicate is not None:
        raise DuplicateFrequencyError

    frequency = Frequency(
        cooperative_id=cooperative_id,
        route_id=route.id,
        bus_group_id=group.id,
        departure_time=payload.departure_time,
        resolution_number=payload.resolution_number.strip(),
    )
    db.add(frequency)
    db.commit()
    db.refresh(frequency)
    frequency.route = route
    return _frequency_read(frequency)


def _local_datetime(service_date: date, departure_time: time) -> datetime:
    return datetime.combine(service_date, departure_time, tzinfo=LOCAL_TIMEZONE)


def _as_local(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=LOCAL_TIMEZONE)
    return value.astimezone(LOCAL_TIMEZONE)


def _schedule_entries(
    db: Session,
    cooperative_id: int,
    bus_ids: set[int],
    start: datetime,
    end: datetime,
    excluded_sheet_id: int | None,
) -> list[tuple[int, datetime, int, int, int, str]]:
    statement = (
        select(Trip)
        .join(Frequency, Trip.frequency_id == Frequency.id)
        .join(Route, Frequency.route_id == Route.id)
        .options(selectinload(Trip.frequency).selectinload(Frequency.route))
        .where(
            Trip.cooperative_id == cooperative_id,
            Trip.bus_id.in_(bus_ids),
            Trip.status != TripStatus.CANCELLED,
            Trip.departure_at >= start,
            Trip.departure_at < end,
            Route.cooperative_id == cooperative_id,
        )
    )
    if excluded_sheet_id is not None:
        statement = statement.where(
            (Trip.route_sheet_id.is_(None))
            | (Trip.route_sheet_id != excluded_sheet_id)
        )

    entries = []
    for trip in db.scalars(statement).all():
        route = trip.frequency.route
        if route.duration_minutes is None:
            raise BusAssignmentError(
                f"El viaje existente {trip.id} no tiene duración registrada y no se puede validar."
            )
        entries.append(
            (
                trip.bus_id,
                _as_local(trip.departure_at),
                route.duration_minutes,
                route.origin_city_id,
                route.destination_city_id,
                f"viaje {trip.id}",
            )
        )
    return entries


def _validate_assignments(
    db: Session,
    cooperative_id: int,
    service_date: date,
    assignments: list[tuple[Frequency, Bus]],
    starting_locations: dict[int, int],
    excluded_sheet_id: int | None,
) -> None:
    bus_ids = {bus.id for _, bus in assignments}
    if not bus_ids:
        return
    start = _local_datetime(service_date, time.min) - timedelta(days=1)
    end = _local_datetime(service_date, time.min) + timedelta(days=2)
    entries = _schedule_entries(
        db,
        cooperative_id,
        bus_ids,
        start,
        end,
        excluded_sheet_id,
    )

    for frequency, bus in assignments:
        route = frequency.route
        if route.duration_minutes is None:
            raise BusAssignmentError(
                f"La ruta {route.origin_city.name} - {route.destination_city.name} "
                "necesita una duración para verificar la disponibilidad."
            )
        entries.append(
            (
                bus.id,
                _local_datetime(service_date, frequency.departure_time),
                route.duration_minutes,
                route.origin_city_id,
                route.destination_city_id,
                f"{route.origin_city.name} - {route.destination_city.name}",
            )
        )

    entries.sort(key=lambda entry: (entry[0], entry[1]))
    previous_by_bus: dict[int, tuple[int, datetime, int, int, int, str]] = {}
    first_daily_routes: dict[int, int] = {}
    for entry in entries:
        bus_id, departure_at, duration, origin_id, destination_id, label = entry
        previous = previous_by_bus.get(bus_id)
        if previous is not None:
            _, previous_departure, previous_duration, _, previous_destination, previous_label = previous
            previous_arrival = previous_departure + timedelta(minutes=previous_duration)
            next_allowed_departure = previous_arrival + timedelta(
                minutes=BUS_TURNAROUND_MINUTES
            )
            bus = next(bus for _, bus in assignments if bus.id == bus_id)
            if departure_at < next_allowed_departure:
                raise BusAssignmentError(
                    f"El bus {bus.number} se cruza entre {previous_label} y {label}; "
                    f"debe tener {BUS_TURNAROUND_MINUTES} minutos para el cambio de servicio."
                )
            if (
                previous_departure.date() == departure_at.date()
                and previous_destination != origin_id
            ):
                raise BusAssignmentError(
                    f"El bus {bus.number} termina {previous_label} en otra ciudad; "
                    f"no puede iniciar {label} desde ese punto."
                )
        previous_by_bus[bus_id] = entry
        if departure_at.date() == service_date:
            first_daily_routes.setdefault(bus_id, origin_id)

    for bus_id, origin_city_id in first_daily_routes.items():
        if starting_locations.get(bus_id) != origin_city_id:
            bus = next(bus for _, bus in assignments if bus.id == bus_id)
            raise BusAssignmentError(
                f"Indica la ubicación inicial correcta del bus {bus.number}; "
                "debe coincidir con la ciudad de salida de su primer servicio."
            )


def get_route_sheet(
    db: Session,
    cooperative_id: int,
    bus_group_id: int,
    service_date: date,
) -> dict:
    group = db.scalar(
        select(BusGroup).where(
            BusGroup.id == bus_group_id,
            BusGroup.cooperative_id == cooperative_id,
        )
    )
    if group is None:
        raise BusGroupNotFoundError

    sheet = db.scalar(
        select(RouteSheet)
        .options(selectinload(RouteSheet.trips))
        .where(
            RouteSheet.cooperative_id == cooperative_id,
            RouteSheet.bus_group_id == bus_group_id,
            RouteSheet.service_date == service_date,
        )
    )
    trips_by_frequency = {
        trip.frequency_id: trip for trip in sheet.trips
    } if sheet else {}
    starting_locations = (
        db.scalars(
            select(RouteSheetBusLocation).where(
                RouteSheetBusLocation.route_sheet_id == sheet.id
            )
        ).all()
        if sheet
        else []
    )
    frequencies = list_frequencies(db, cooperative_id, bus_group_id)
    if sheet is not None and sheet.status == RouteSheetStatus.PUBLISHED:
        frequencies = [
            frequency
            for frequency in frequencies
            if frequency["id"] in trips_by_frequency
        ]
    buses = db.scalars(
        select(Bus)
        .where(
            Bus.cooperative_id == cooperative_id,
            Bus.group_id == bus_group_id,
        )
        .order_by(Bus.number, Bus.id)
    ).all()
    can_reassign = False
    if sheet is not None and sheet.status == RouteSheetStatus.PUBLISHED and sheet.trips:
        trip_ids = [trip.id for trip in sheet.trips]
        has_reservations = db.scalar(
            select(Reservation.id).where(Reservation.trip_id.in_(trip_ids)).limit(1)
        )
        can_reassign = (
            has_reservations is None
            and all(
                trip.status == TripStatus.SCHEDULED
                and _as_local(trip.departure_at) > datetime.now(LOCAL_TIMEZONE)
                for trip in sheet.trips
            )
        )

    return {
        "id": sheet.id if sheet else None,
        "bus_group_id": bus_group_id,
        "service_date": service_date,
        "status": sheet.status if sheet else None,
        "can_reassign": can_reassign,
        "frequencies": [
            {
                "frequency_id": frequency["id"],
                "route_id": frequency["route_id"],
                "route_name": frequency["route_name"],
                "departure_time": frequency["departure_time"],
                "duration_minutes": frequency["duration_minutes"],
                "resolution_number": frequency["resolution_number"],
                "stops": frequency["stops"],
                "bus_id": (
                    trips_by_frequency[frequency["id"]].bus_id
                    if frequency["id"] in trips_by_frequency
                    else None
                ),
            }
            for frequency in frequencies
        ],
        "buses": [
            {
                "id": bus.id,
                "number": bus.number,
                "plate": bus.plate,
                "status": bus.status,
                "is_active": bus.is_active,
            }
            for bus in buses
        ],
        "starting_locations": [
            {"bus_id": location.bus_id, "city_id": location.city_id}
            for location in starting_locations
        ],
    }


def save_route_sheet(
    db: Session,
    cooperative_id: int,
    payload: RouteSheetSave,
) -> dict:
    group = db.scalar(
        select(BusGroup).where(
            BusGroup.id == payload.bus_group_id,
            BusGroup.cooperative_id == cooperative_id,
        )
    )
    if group is None:
        raise BusGroupNotFoundError

    sheet = db.scalar(
        select(RouteSheet)
        .options(selectinload(RouteSheet.trips))
        .where(
            RouteSheet.cooperative_id == cooperative_id,
            RouteSheet.bus_group_id == payload.bus_group_id,
            RouteSheet.service_date == payload.service_date,
        )
    )
    is_published = sheet is not None and sheet.status == RouteSheetStatus.PUBLISHED
    if is_published:
        db.scalars(
            select(Trip)
            .where(Trip.route_sheet_id == sheet.id)
            .with_for_update()
        ).all()

    assignment_ids = [item.frequency_id for item in payload.assignments]
    if len(set(assignment_ids)) != len(assignment_ids):
        raise BusAssignmentError("No repitas una frecuencia en la hoja de ruta.")

    frequencies_by_id = {
        frequency.id: frequency
        for frequency in db.scalars(
            select(Frequency)
            .join(Route, Frequency.route_id == Route.id)
            .options(
                selectinload(Frequency.route).selectinload(Route.origin_city),
                selectinload(Frequency.route).selectinload(Route.destination_city),
            )
            .where(
                Frequency.id.in_(assignment_ids),
                Frequency.cooperative_id == cooperative_id,
                Frequency.bus_group_id == payload.bus_group_id,
                Frequency.is_active.is_(True),
                Route.cooperative_id == cooperative_id,
                Route.is_active.is_(True),
            )
        ).all()
    } if assignment_ids else {}
    if set(frequencies_by_id) != set(assignment_ids):
        raise FrequencyNotFoundError
    if is_published:
        published_frequency_ids = {trip.frequency_id for trip in sheet.trips}
        if (
            set(assignment_ids) != published_frequency_ids
            or any(item.bus_id is None for item in payload.assignments)
            or any(
                trip.status != TripStatus.SCHEDULED
                or _as_local(trip.departure_at) <= datetime.now(LOCAL_TIMEZONE)
                for trip in sheet.trips
            )
        ):
            raise RouteSheetPublishedError

    buses_by_id: dict[int, Bus] = {}
    selected_assignments: list[tuple[Frequency, Bus]] = []
    for item in payload.assignments:
        if item.bus_id is None:
            continue
        bus = db.scalar(
            select(Bus).where(
                Bus.id == item.bus_id,
                Bus.cooperative_id == cooperative_id,
                Bus.group_id == payload.bus_group_id,
            )
        )
        if bus is None:
            raise BusAssignmentError(
                "El bus seleccionado no pertenece al grupo de la frecuencia."
            )
        if bus.status != BusStatus.OPERATIONAL or not bus.is_active:
            raise BusAssignmentError(
                f"El bus {bus.number} no está operativo; no puede asignarse al servicio."
            )
        buses_by_id[bus.id] = bus
        selected_assignments.append((frequencies_by_id[item.frequency_id], bus))

    starting_location_ids = [item.bus_id for item in payload.starting_locations]
    if len(set(starting_location_ids)) != len(starting_location_ids):
        raise BusAssignmentError("No repitas la ubicación inicial de un bus.")
    if set(starting_location_ids) != {bus.id for bus in buses_by_id.values()}:
        raise BusAssignmentError(
            "Indica la ciudad inicial de cada bus asignado en la hoja."
        )
    city_ids = {item.city_id for item in payload.starting_locations}
    existing_city_ids = set(
        db.scalars(select(City.id).where(City.id.in_(city_ids))).all()
    ) if city_ids else set()
    if existing_city_ids != city_ids:
        raise BusAssignmentError("Una de las ciudades iniciales no existe.")
    starting_locations = {
        item.bus_id: item.city_id for item in payload.starting_locations
    }

    trip_ids = [trip.id for trip in sheet.trips] if sheet else []
    if trip_ids and db.scalar(
        select(Reservation.id).where(Reservation.trip_id.in_(trip_ids)).limit(1)
    ):
        raise RouteSheetHasReservationsError

    _validate_assignments(
        db,
        cooperative_id,
        payload.service_date,
        selected_assignments,
        starting_locations,
        sheet.id if sheet else None,
    )

    if sheet is None:
        sheet = RouteSheet(
            cooperative_id=cooperative_id,
            bus_group_id=payload.bus_group_id,
            service_date=payload.service_date,
            mode=RouteSheetMode.MANUAL,
            status=RouteSheetStatus.DRAFT,
        )
        db.add(sheet)
        db.flush()
    elif not is_published:
        for trip in list(sheet.trips):
            db.delete(trip)
            sheet.trips.remove(trip)
        db.flush()

    db.execute(
        RouteSheetBusLocation.__table__.delete().where(
            RouteSheetBusLocation.route_sheet_id == sheet.id
        )
    )
    db.add_all(
        [
            RouteSheetBusLocation(
                route_sheet_id=sheet.id,
                bus_id=bus_id,
                city_id=city_id,
            )
            for bus_id, city_id in starting_locations.items()
        ]
    )
    if is_published:
        trips_by_frequency = {trip.frequency_id: trip for trip in sheet.trips}
        for frequency, bus in selected_assignments:
            trips_by_frequency[frequency.id].bus_id = bus.id
    else:
        db.add_all(
            [
                Trip(
                    cooperative_id=cooperative_id,
                    frequency_id=frequency.id,
                    bus_id=bus.id,
                    route_sheet_id=sheet.id,
                    departure_at=_local_datetime(
                        payload.service_date,
                        frequency.departure_time,
                    ),
                    status=TripStatus.SCHEDULED,
                )
                for frequency, bus in selected_assignments
            ]
        )
    db.commit()
    db.refresh(sheet)
    return get_route_sheet(
        db,
        cooperative_id,
        payload.bus_group_id,
        payload.service_date,
    )


def publish_route_sheet(
    db: Session,
    cooperative_id: int,
    sheet_id: int,
) -> dict:
    sheet = db.scalar(
        select(RouteSheet)
        .options(selectinload(RouteSheet.trips))
        .where(
            RouteSheet.id == sheet_id,
            RouteSheet.cooperative_id == cooperative_id,
        )
    )
    if sheet is None:
        raise RouteSheetNotFoundError
    if sheet.status == RouteSheetStatus.PUBLISHED:
        return get_route_sheet(
            db,
            cooperative_id,
            sheet.bus_group_id,
            sheet.service_date,
        )

    active_frequency_ids = set(
        db.scalars(
            select(Frequency.id)
            .join(Route, Frequency.route_id == Route.id)
            .where(
                Frequency.cooperative_id == cooperative_id,
                Frequency.bus_group_id == sheet.bus_group_id,
                Frequency.is_active.is_(True),
                Route.cooperative_id == cooperative_id,
                Route.is_active.is_(True),
            )
        ).all()
    )
    if not active_frequency_ids:
        raise BusAssignmentError(
            "Crea al menos una frecuencia para este grupo antes de publicar."
        )
    assigned_frequency_ids = {trip.frequency_id for trip in sheet.trips}
    missing_frequency_ids = active_frequency_ids - assigned_frequency_ids
    if missing_frequency_ids:
        raise BusAssignmentError(
            "Asigna un bus a todas las frecuencias activas antes de publicar la hoja."
        )
    if assigned_frequency_ids - active_frequency_ids:
        raise BusAssignmentError(
            "La hoja contiene frecuencias que ya no están activas; vuelve a guardar el borrador."
        )

    assigned_pairs = db.execute(
        select(Frequency, Bus)
        .join(Trip, Trip.frequency_id == Frequency.id)
        .join(Bus, Trip.bus_id == Bus.id)
        .join(Route, Frequency.route_id == Route.id)
        .options(
            selectinload(Frequency.route).selectinload(Route.origin_city),
            selectinload(Frequency.route).selectinload(Route.destination_city),
        )
        .where(
            Trip.route_sheet_id == sheet.id,
            Trip.cooperative_id == cooperative_id,
            Frequency.cooperative_id == cooperative_id,
            Bus.cooperative_id == cooperative_id,
            Route.cooperative_id == cooperative_id,
        )
    ).all()
    for _, bus in assigned_pairs:
        if not bus.is_active or bus.status != BusStatus.OPERATIONAL:
            raise BusAssignmentError(
                f"El bus {bus.number} ya no está operativo; reemplázalo antes de publicar."
            )
    starting_locations = {
        row.bus_id: row.city_id
        for row in db.scalars(
            select(RouteSheetBusLocation).where(
                RouteSheetBusLocation.route_sheet_id == sheet.id
            )
        ).all()
    }
    _validate_assignments(
        db,
        cooperative_id,
        sheet.service_date,
        list(assigned_pairs),
        starting_locations,
        sheet.id,
    )

    sheet.status = RouteSheetStatus.PUBLISHED
    db.commit()
    return get_route_sheet(
        db,
        cooperative_id,
        sheet.bus_group_id,
        sheet.service_date,
    )