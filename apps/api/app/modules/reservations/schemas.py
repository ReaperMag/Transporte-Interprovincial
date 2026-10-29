from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.buses.models import SeatType
from app.modules.passengers.models import PassengerCategory
from app.modules.reservations.models import ReservationStatus


class SeatAvailability(BaseModel):
    seatId: int
    number: int
    floor: int
    row: int
    column: int
    seatType: SeatType
    isAvailable: bool


class TripSeatsResponse(BaseModel):
    tripId: int
    originCityId: int
    destinationCityId: int

    busTemplateId: int
    floors: int
    rows: int
    columns: int

    seats: list[SeatAvailability]


class ReservationPassengerInput(BaseModel):
    idNumber: str = Field(min_length=5, max_length=13)
    firstName: str = Field(min_length=1, max_length=100)
    lastName: str = Field(min_length=1, max_length=100)
    birthDate: date | None = None
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    # Categoría que declara quien compra. El chofer la verifica al subir al bus.
    category: PassengerCategory = PassengerCategory.REGULAR

    @field_validator("idNumber", "firstName", "lastName")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("El campo no puede estar vacío.")
        return value


class ReservationSeatInput(BaseModel):
    seatId: int = Field(gt=0)
    passenger: ReservationPassengerInput


class ReservationCreate(BaseModel):
    tripId: int = Field(gt=0)
    originCityId: int = Field(gt=0)
    destinationCityId: int = Field(gt=0)
    seats: list[ReservationSeatInput] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_seats(self) -> "ReservationCreate":
        if self.originCityId == self.destinationCityId:
            raise ValueError("El origen y el destino deben ser diferentes.")

        seat_ids = [seat.seatId for seat in self.seats]
        if len(seat_ids) != len(set(seat_ids)):
            raise ValueError("No se puede repetir un asiento en la misma reserva.")

        id_numbers = [seat.passenger.idNumber.upper() for seat in self.seats]
        if len(id_numbers) != len(set(id_numbers)):
            raise ValueError("Un pasajero no puede ocupar dos asientos en la misma reserva.")

        return self


class ReservationSeatRead(BaseModel):
    seatId: int
    seatNumber: int
    seatType: SeatType

    passengerId: int
    passengerIdNumber: str
    passengerName: str
    passengerCategory: PassengerCategory

    basePrice: Decimal
    discountAmount: Decimal
    price: Decimal


class ReservationRead(BaseModel):
    id: int
    tripId: int
    status: ReservationStatus

    originCityId: int
    destinationCityId: int
    departureAt: datetime

    expiresAt: datetime | None
    total: Decimal

    seats: list[ReservationSeatRead]
