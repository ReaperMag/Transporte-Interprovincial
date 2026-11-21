from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.buses.models import Bus, BusTemplate, TemplateSeat
from app.modules.passengers.models import Passenger
from app.modules.passengers.repository import get_passenger_by_id_number
from app.modules.reservations.service import (
    FareNotFoundError,
    InvalidSegmentError,
    calculate_discount,
    get_fare_price,
    get_occupied_seat_ids,
    get_route_city_order,
    get_segment,
    now_local,
)
from app.modules.routes.models import City, Route
from app.modules.sales.onboard_schemas import (
    OnboardPassengerInput,
    OnboardSaleCreate,
    OnboardSaleOptions,
    OnboardSaleRead,
    OnboardSeat,
    OnboardStop,
)
from app.modules.schedules.models import Frequency
from app.modules.staff.models import Staff
from app.modules.tickets.generator import generate_ticket_code
from app.modules.tickets.models import SaleChannel, Ticket, TicketStatus
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


def get_or_create_onboard_passenger(db: Session, data: OnboardPassengerInput) -> Passenger:
    """Reutiliza al pasajero por su cédula o lo registra sin cuenta."""
    passenger = get_passenger_by_id_number(db, data.idNumber)
    if passenger is None:
        passenger = Passenger(
            id_number=data.idNumber.upper(),
            first_name=data.firstName,
            last_name=data.lastName,
            category=data.category,
        )
        db.add(passenger)
        db.flush()
    return passenger


def create_onboard_sale(
    db: Session, staff: Staff, trip_id: int, data: OnboardSaleCreate
) -> Ticket:
    """
    Registra un pasaje vendido a bordo y cobrado en efectivo. El boleto queda
    usado porque la persona ya está en el bus, y guarda quién lo vendió.
    """
    trip = get_selling_trip(db, staff, trip_id)
    segment = trip_segment(trip, data.originCityId, data.destinationCityId)
    seat = get_trip_seat(trip, data.seatId)

    if seat.id in get_occupied_seat_ids(db, trip, segment):
        raise BusStaffTripConflictError(f"El asiento {seat.number} está ocupado en ese tramo.")

    price = data.price
    if price is None:
        base_price = suggested_price(db, trip, data.originCityId, data.destinationCityId, seat)
        if base_price is None:
            raise OnboardSaleValidationError(
                "No hay una tarifa registrada para este tramo; escribe el precio."
            )
        price = base_price - calculate_discount(base_price, data.passenger.category)

    passenger = get_or_create_onboard_passenger(db, data.passenger)
    current_time = now_local()
    ticket = Ticket(
        code=generate_ticket_code(),
        trip_id=trip.id,
        seat_id=seat.id,
        passenger_id=passenger.id,
        reservation_seat_id=None,
        channel=SaleChannel.ON_BOARD,
        origin_city_id=data.originCityId,
        destination_city_id=data.destinationCityId,
        passenger_category=data.passenger.category,
        price=price,
        status=TicketStatus.USED,
        sold_by_id=staff.id,
        boarding_description=data.boardingDescription,
        destination_description=data.destinationDescription,
        validated_at=current_time,
        validated_by_id=staff.id,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


def build_onboard_sale_read(db: Session, ticket: Ticket) -> OnboardSaleRead:
    passenger = db.get(Passenger, ticket.passenger_id)
    seller = db.get(Staff, ticket.sold_by_id) if ticket.sold_by_id else None
    return OnboardSaleRead(
        ticketId=ticket.id,
        code=ticket.code,
        seatNumber=db.get(TemplateSeat, ticket.seat_id).number,
        passengerName=f"{passenger.first_name} {passenger.last_name}",
        passengerIdNumber=passenger.id_number,
        passengerCategory=ticket.passenger_category,
        originCityName=db.get(City, ticket.origin_city_id).name,
        destinationCityName=db.get(City, ticket.destination_city_id).name,
        boardingDescription=ticket.boarding_description,
        destinationDescription=ticket.destination_description,
        price=ticket.price,
        soldByName=f"{seller.first_name} {seller.last_name}" if seller else None,
        soldAt=ticket.created_at,
    )
