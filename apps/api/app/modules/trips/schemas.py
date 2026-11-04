from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.modules.buses.models import SeatType


class CityOption(BaseModel):
    id: int
    name: str
    province: str


class TripFareOption(BaseModel):
    seatType: SeatType
    price: Decimal


class TripSearchResult(BaseModel):
    tripId: int
    routeId: int

    cooperativeId: int
    cooperativeName: str

    originCityId: int
    originCityName: str

    destinationCityId: int
    destinationCityName: str

    departureAt: datetime
    durationMinutes: int | None

    busId: int
    busNumber: str
    busTemplateId: int

    fares: list[TripFareOption]