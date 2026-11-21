from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.passengers.models import PassengerCategory
from app.modules.tickets.models import SaleChannel, TicketStatus
from app.modules.trips.models import TripStatus


class BusStaffTripSummary(BaseModel):
    """Viaje del bus asignado, como lo ve el personal del bus en su lista."""

    id: int
    status: TripStatus
    departureAt: datetime
    originCityName: str
    destinationCityName: str
    busNumber: str
    ticketsSold: int
    passengersBoarded: int


class BusStaffPassenger(BaseModel):
    """Pasajero con boleto en el viaje y su estado de abordaje."""

    ticketId: int
    seatNumber: int
    passengerName: str
    passengerIdNumber: str
    passengerCategory: PassengerCategory
    originCityName: str
    destinationCityName: str
    channel: SaleChannel
    price: Decimal
    status: TicketStatus
    validatedAt: datetime | None
    rejectionReason: str | None


class BusStaffTripDetail(BusStaffTripSummary):
    boardingStartedAt: datetime | None
    startedAt: datetime | None
    finishedAt: datetime | None
    passengers: list[BusStaffPassenger]


class TicketValidationRequest(BaseModel):
    """Código leído del QR o escrito a mano por el personal del bus."""

    code: str = Field(min_length=1, max_length=64)


class TicketValidationResult(BaseModel):
    # boarded: el boleto quedó usado y la persona sube.
    # needs_category_check: hay que revisar la cédula o el carné antes de subir.
    result: Literal["boarded", "needs_category_check"]
    message: str
    passenger: BusStaffPassenger
