from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.core.validators import Cedula, PersonName
from app.modules.buses.models import SeatType
from app.modules.passengers.models import PassengerCategory


class OnboardStop(BaseModel):
    """Ciudad registrada de la ruta, en el orden en que pasa el bus."""

    cityId: int
    cityName: str


class OnboardSeat(BaseModel):
    seatId: int
    seatNumber: int
    seatType: SeatType
    isFree: bool
    # Tarifa del tramo para este tipo de asiento, sin descuento. Nula si no hay tarifa.
    suggestedPrice: Decimal | None


class OnboardSaleOptions(BaseModel):
    """Lo que necesita el personal del bus para vender un pasaje a bordo."""

    stops: list[OnboardStop]
    originCityId: int
    destinationCityId: int
    seats: list[OnboardSeat]


Description = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
]


class OnboardPassengerInput(BaseModel):
    idNumber: Cedula
    firstName: PersonName = Field(max_length=100)
    lastName: PersonName = Field(max_length=100)
    category: PassengerCategory = PassengerCategory.REGULAR


class OnboardSaleCreate(BaseModel):
    seatId: int = Field(gt=0)
    passenger: OnboardPassengerInput
    # Paradas registradas más cercanas a donde subió y a donde va.
    originCityId: int = Field(gt=0)
    destinationCityId: int = Field(gt=0)
    # Lugar exacto, por ejemplo "Gasolinera de Salcedo".
    boardingDescription: Description
    destinationDescription: Description
    # Si no se envía, se cobra la tarifa sugerida con el descuento de la categoría.
    price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)


class OnboardSaleRead(BaseModel):
    ticketId: int
    code: str
    seatNumber: int
    passengerName: str
    passengerIdNumber: str
    passengerCategory: PassengerCategory
    originCityName: str
    destinationCityName: str
    boardingDescription: str | None
    destinationDescription: str | None
    price: Decimal
    soldByName: str | None
    soldAt: datetime


class OnboardSalesSummary(BaseModel):
    sales: list[OnboardSaleRead]
    total: Decimal
