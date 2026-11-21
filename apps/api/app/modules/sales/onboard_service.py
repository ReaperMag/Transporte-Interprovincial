from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.buses.models import Bus, BusTemplate, TemplateSeat
from app.modules.reservations.service import (
    FareNotFoundError,
    InvalidSegmentError,
    get_fare_price,
    get_occupied_seat_ids,
    get_route_city_order,
    get_segment,
)
from app.modules.routes.models import City, Route
from app.modules.sales.onboard_schemas import OnboardSaleOptions, OnboardSeat, OnboardStop
from app.modules.schedules.models import Frequency
from app.modules.staff.models import Staff
from app.modules.trips.bus_staff_service import (
    BusStaffTripConflictError,
    BusStaffTripError,
    get_staff_trip,
)
from app.modules.trips.models import Trip, TripStatus


class OnboardSaleValidationError(BusStaffTripError):
    pass


def get_selling_trip(db: Session, staff: Staff, trip_id: int) -> Trip:
    """Viaje del bus asignado que está en curso: el único momento de vender a bordo."""
    trip = get_staff_trip(db, staff, trip_id)
    if trip.status != TripStatus.IN_PROGRESS:
        raise BusStaffTripConflictError("Solo se vende a bordo con el viaje en curso.")
    return db.scalar(
        select(Trip)
        .where(Trip.id == trip.id)
        .options(
            selectinload(Trip.frequency)
            .selectinload(Frequency.route)
            .selectinload(Route.stops),
            selectinload(Trip.bus).selectinload(Bus.template),
        )
    )


def trip_segment(trip: Trip, origin_city_id: int, destination_city_id: int) -> tuple[int, int]:
    try:
        return get_segment(trip.frequency.route, origin_city_id, destination_city_id)
    except InvalidSegmentError as exc:
        raise OnboardSaleValidationError(str(exc)) from exc


def suggested_price(
    db: Session, trip: Trip, origin_id: int, destination_id: int, seat: TemplateSeat
) -> Decimal | None:
    try:
        return get_fare_price(db, trip.frequency.route.id, origin_id, destination_id, seat)
    except FareNotFoundError:
        return None


def get_onboard_sale_options(
    db: Session,
    staff: Staff,
    trip_id: int,
    origin_city_id: int | None,
    destination_city_id: int | None,
) -> OnboardSaleOptions:
    """
    Paradas de la ruta, asientos libres y tarifa sugerida del tramo. Si no se
    indica el tramo, se usa el recorrido completo.
    """
    trip = get_selling_trip(db, staff, trip_id)
    route = trip.frequency.route
    city_order = get_route_city_order(route)
    origin_id = origin_city_id or city_order[0]
    destination_id = destination_city_id or city_order[-1]
    segment = trip_segment(trip, origin_id, destination_id)
    occupied = get_occupied_seat_ids(db, trip, segment)

    template: BusTemplate = trip.template or trip.bus.template
    seats = sorted(template.seats, key=lambda seat: seat.number)
    return OnboardSaleOptions(
        stops=[
            OnboardStop(cityId=city_id, cityName=db.get(City, city_id).name)
            for city_id in city_order
        ],
        originCityId=origin_id,
        destinationCityId=destination_id,
        seats=[
            OnboardSeat(
                seatId=seat.id,
                seatNumber=seat.number,
                seatType=seat.seat_type,
                isFree=seat.id not in occupied,
                suggestedPrice=suggested_price(db, trip, origin_id, destination_id, seat),
            )
            for seat in seats
        ],
    )


def get_trip_seat(trip: Trip, seat_id: int) -> TemplateSeat:
    template: BusTemplate = trip.template or trip.bus.template
    seat = next((seat for seat in template.seats if seat.id == seat_id), None)
    if seat is None:
        raise OnboardSaleValidationError("El asiento no pertenece al bus de este viaje.")
    return seat
