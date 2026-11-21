from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.buses.models import Bus, TemplateSeat
from app.modules.passengers.models import Passenger
from app.modules.reports.schemas import (
    BusTripHistory,
    BusTripHistoryItem,
    TripChannelTotals,
    TripPassengerCounts,
    TripReport,
    TripReportOnboardSale,
)
from app.modules.reservations.service import as_local
from app.modules.routes.models import City, Route
from app.modules.schedules.models import Frequency
from app.modules.tickets.models import SaleChannel, Ticket, TicketStatus
from app.modules.trips.bus_staff_service import (
    BusStaffTripConflictError,
    BusStaffTripError,
    build_problem_read,
    list_trip_problems,
    staff_name,
    stored_utc_to_local,
)
from app.modules.trips.models import Trip, TripStatus


# El reporte existe desde que empieza el abordaje.
REPORTABLE_STATUSES = (TripStatus.BOARDING, TripStatus.IN_PROGRESS, TripStatus.FINISHED)

ZERO = Decimal("0.00")


class TripReportNotFoundError(BusStaffTripError):
    pass


def ensure_reportable(trip: Trip) -> None:
    if trip.status not in REPORTABLE_STATUSES:
        raise BusStaffTripConflictError(
            "El reporte está disponible desde que empieza el abordaje."
        )


def get_cooperative_trip(db: Session, cooperative_id: int, trip_id: int) -> Trip:
    trip = db.get(Trip, trip_id)
    if trip is None or trip.cooperative_id != cooperative_id:
        raise TripReportNotFoundError("Viaje no encontrado.")
    return trip


def duration_minutes(trip: Trip) -> int | None:
    if trip.started_at is None or trip.finished_at is None:
        return None
    elapsed = as_local(trip.finished_at) - as_local(trip.started_at)
    return int(elapsed.total_seconds() // 60)


def build_onboard_sale(db: Session, ticket: Ticket) -> TripReportOnboardSale:
    passenger = db.get(Passenger, ticket.passenger_id)
    return TripReportOnboardSale(
        seatNumber=db.get(TemplateSeat, ticket.seat_id).number,
        passengerName=f"{passenger.first_name} {passenger.last_name}",
        passengerCategory=ticket.passenger_category,
        originCityName=db.get(City, ticket.origin_city_id).name,
        destinationCityName=db.get(City, ticket.destination_city_id).name,
        boardingDescription=ticket.boarding_description,
        destinationDescription=ticket.destination_description,
        price=ticket.price,
        soldByName=staff_name(db, ticket.sold_by_id),
        soldAt=stored_utc_to_local(ticket.created_at),
    )


def build_trip_report(db: Session, trip: Trip) -> TripReport:
    """Arma el reporte con los boletos del viaje, sin contar los cancelados."""
    ensure_reportable(trip)
    route = db.get(Route, db.get(Frequency, trip.frequency_id).route_id)
    bus = db.get(Bus, trip.bus_id)
    tickets = db.scalars(
        select(Ticket)
        .where(Ticket.trip_id == trip.id, Ticket.status != TicketStatus.CANCELLED)
        .order_by(Ticket.created_at, Ticket.id)
    ).all()

    sold = [ticket for ticket in tickets if ticket.channel != SaleChannel.ON_BOARD]
    onboard = [ticket for ticket in tickets if ticket.channel == SaleChannel.ON_BOARD]

    def total_of(channel: SaleChannel) -> Decimal:
        return sum((t.price for t in tickets if t.channel == channel), ZERO)

    totals = TripChannelTotals(
        online=total_of(SaleChannel.ONLINE),
        office=total_of(SaleChannel.OFFICE),
        onBoard=total_of(SaleChannel.ON_BOARD),
        total=sum((ticket.price for ticket in tickets), ZERO),
    )

    return TripReport(
        tripId=trip.id,
        status=trip.status,
        originCityName=db.get(City, route.origin_city_id).name,
        destinationCityName=db.get(City, route.destination_city_id).name,
        busNumber=bus.number,
        busPlate=bus.plate,
        scheduledDepartureAt=trip.departure_at,
        boardingStartedAt=trip.boarding_started_at,
        startedAt=trip.started_at,
        finishedAt=trip.finished_at,
        durationMinutes=duration_minutes(trip),
        boardingStartedByName=staff_name(db, trip.boarding_started_by_id),
        startedByName=staff_name(db, trip.started_by_id),
        finishedByName=staff_name(db, trip.finished_by_id),
        passengers=TripPassengerCounts(
            ticketsSold=len(sold),
            boarded=sum(ticket.status == TicketStatus.USED for ticket in sold),
            noShow=sum(
                ticket.status == TicketStatus.NO_SHOW and ticket.rejection_reason is None
                for ticket in sold
            ),
            rejected=sum(ticket.rejection_reason is not None for ticket in sold),
            onboardSales=len(onboard),
        ),
        totals=totals,
        onboardSales=[build_onboard_sale(db, ticket) for ticket in onboard],
        problems=[build_problem_read(db, problem) for problem in list_trip_problems(db, trip)],
    )


class BusNotFoundError(BusStaffTripError):
    pass


def get_cooperative_bus(db: Session, cooperative_id: int, bus_id: int) -> Bus:
    bus = db.get(Bus, bus_id)
    if bus is None or bus.cooperative_id != cooperative_id:
        raise BusNotFoundError("Bus no encontrado.")
    return bus


def build_bus_history(db: Session, bus: Bus) -> BusTripHistory:
    """
    Viajes del bus desde que empezó su abordaje, del más reciente al más
    antiguo. El historial queda en el bus aunque cambie el personal.
    """
    trips = db.scalars(
        select(Trip)
        .where(Trip.bus_id == bus.id, Trip.status.in_(REPORTABLE_STATUSES))
        .order_by(Trip.departure_at.desc(), Trip.id.desc())
    ).all()

    items = []
    for trip in trips:
        report = build_trip_report(db, trip)
        items.append(
            BusTripHistoryItem(
                tripId=trip.id,
                status=trip.status,
                originCityName=report.originCityName,
                destinationCityName=report.destinationCityName,
                scheduledDepartureAt=trip.departure_at,
                startedAt=trip.started_at,
                finishedAt=trip.finished_at,
                durationMinutes=report.durationMinutes,
                passengersBoarded=report.passengers.boarded,
                onboardSales=report.passengers.onboardSales,
                total=report.totals.total,
                openProblems=sum(problem.resolvedAt is None for problem in report.problems),
            )
        )

    return BusTripHistory(busId=bus.id, busNumber=bus.number, busPlate=bus.plate, trips=items)
