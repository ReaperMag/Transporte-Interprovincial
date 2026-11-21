from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.modules.passengers.models import PassengerCategory
from app.modules.trips.bus_staff_schemas import TripProblemRead
from app.modules.trips.models import TripStatus


class TripPassengerCounts(BaseModel):
    # Boletos vendidos en línea y en oficina, sin contar los cancelados
    ticketsSold: int
    # Pasajeros que subieron con boleto validado, sin las ventas a bordo
    boarded: int
    # No se presentaron a tiempo para el abordaje
    noShow: int
    # La categoría con descuento no correspondía
    rejected: int
    onboardSales: int


class TripChannelTotals(BaseModel):
    online: Decimal
    office: Decimal
    onBoard: Decimal
    total: Decimal


class TripReportOnboardSale(BaseModel):
    seatNumber: int
    passengerName: str
    passengerCategory: PassengerCategory
    originCityName: str
    destinationCityName: str
    boardingDescription: str | None
    destinationDescription: str | None
    price: Decimal
    soldByName: str | None
    soldAt: datetime


class TripReport(BaseModel):
    """Lo que pasó en un viaje: horarios, pasajeros, recaudación y problemas."""

    tripId: int
    status: TripStatus
    originCityName: str
    destinationCityName: str
    busNumber: str
    busPlate: str
    scheduledDepartureAt: datetime
    boardingStartedAt: datetime | None
    startedAt: datetime | None
    finishedAt: datetime | None
    # Minutos entre la salida real y la llegada; nulo si el viaje no termina
    durationMinutes: int | None
    boardingStartedByName: str | None
    startedByName: str | None
    finishedByName: str | None
    passengers: TripPassengerCounts
    totals: TripChannelTotals
    onboardSales: list[TripReportOnboardSale]
    problems: list[TripProblemRead]
