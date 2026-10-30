import enum
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.modules.buses.models import SeatType
from app.modules.passengers.models import PassengerCategory
from app.modules.tickets.models import SaleChannel, TicketStatus


class TicketValidity(enum.StrEnum):
    VALID = "valid"  # Se puede usar para subir al bus
    USED = "used"  # Ya se validó al subir al bus
    CANCELLED = "cancelled"  # Se reemplazó por otro boleto o se anuló
    EXPIRED = "expired"  # El viaje ya terminó o se canceló


class TicketRead(BaseModel):
    id: int
    code: str
    status: TicketStatus
    validity: TicketValidity
    channel: SaleChannel

    reservationId: int | None
    tripId: int
    cooperativeName: str
    busNumber: str
    departureAt: datetime

    originCityName: str
    destinationCityName: str

    seatId: int
    seatNumber: int
    seatType: SeatType

    passengerName: str
    passengerIdNumber: str
    passengerCategory: PassengerCategory

    price: Decimal
    issuedAt: datetime


class TicketChange(BaseModel):
    """Cambio de boleto en oficina: nueva categoría y, si se quiere, otro asiento."""

    category: PassengerCategory
    seatId: int | None = Field(default=None, gt=0)


class TicketChangeResult(BaseModel):
    previousTicket: TicketRead
    newTicket: TicketRead
    # Lo que se cobra en efectivo. Si el boleto nuevo es más barato no hay devolución.
    amountCharged: Decimal
