from decimal import Decimal
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.core.validators import validate_place_name
from app.modules.buses.models import SeatType
from app.modules.routes.models import RouteType


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class RouteSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
        extra="forbid",
    )


# Ciudades y provincias: solo letras y espacios.
CityName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=100),
    AfterValidator(validate_place_name),
]
ProvinceName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=100),
    AfterValidator(validate_place_name),
]


class CityCreate(RouteSchema):
    name: CityName
    province: ProvinceName


class CityRead(RouteSchema):
    id: int
    name: str
    province: str


class RouteStopCreate(RouteSchema):
    city_id: int = Field(gt=0)
    minutes_from_origin: int = Field(gt=0)


class RouteStopRead(RouteSchema):
    city_id: int
    city_name: str
    province: str
    stop_order: int
    minutes_from_origin: int


class RouteFareCreate(RouteSchema):
    seat_type: SeatType
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)


def _validate_fares(fares: list[RouteFareCreate]) -> list[RouteFareCreate]:
    seat_types = [fare.seat_type for fare in fares]
    if fares and set(seat_types) != {SeatType.NORMAL, SeatType.VIP}:
        raise ValueError("Registra una tarifa Normal y otra VIP.")
    if len(seat_types) != len(set(seat_types)):
        raise ValueError("No se puede repetir el tipo de asiento en las tarifas.")
    return fares


class CooperativeRouteCreate(RouteSchema):
    origin_city_id: int = Field(gt=0)
    destination_city_id: int = Field(gt=0)
    duration_minutes: int = Field(ge=10, le=1440)
    stops: list[RouteStopCreate] = Field(default_factory=list, max_length=20)
    fares: list[RouteFareCreate] = Field(min_length=2, max_length=2)

    @model_validator(mode="after")
    def validate_route(self) -> "CooperativeRouteCreate":
        _validate_fares(self.fares)
        if self.origin_city_id == self.destination_city_id:
            raise ValueError("El origen y el destino deben ser diferentes.")
        if self.origin_city_id in {stop.city_id for stop in self.stops}:
            raise ValueError("Una parada no puede coincidir con el origen.")
        if self.destination_city_id in {stop.city_id for stop in self.stops}:
            raise ValueError("Una parada no puede coincidir con el destino.")
        if len({stop.city_id for stop in self.stops}) != len(self.stops):
            raise ValueError("No se puede repetir una ciudad en las paradas.")
        minutes = [stop.minutes_from_origin for stop in self.stops]
        if any(
            current >= following
            for current, following in zip(minutes, minutes[1:], strict=False)
        ) or any(minute >= self.duration_minutes for minute in minutes):
            raise ValueError(
                "Las subrutas deben estar en orden y antes del tiempo total de llegada."
            )
        return self


class RouteFaresUpdate(RouteSchema):
    fares: list[RouteFareCreate] = Field(min_length=2, max_length=2)

    @model_validator(mode="after")
    def validate_route_fares(self) -> "RouteFaresUpdate":
        _validate_fares(self.fares)
        return self


class RouteFareRead(RouteSchema):
    seat_type: SeatType
    price: Decimal


class CooperativeRouteRead(RouteSchema):
    id: int
    origin_city_id: int
    origin_city: str
    origin_province: str
    destination_city_id: int
    destination_city: str
    destination_province: str
    duration_minutes: int | None
    route_type: RouteType
    is_active: bool
    stops: list[RouteStopRead]
    fares: list[RouteFareRead]