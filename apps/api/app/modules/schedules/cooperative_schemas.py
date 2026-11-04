from datetime import date, time
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.modules.buses.models import BusStatus
from app.modules.schedules.models import RouteSheetStatus


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ScheduleSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
        extra="forbid",
    )


ResolutionNumber = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)
]


class FrequencyCreate(ScheduleSchema):
    route_id: int = Field(gt=0)
    bus_group_id: int = Field(gt=0)
    departure_time: time
    resolution_number: ResolutionNumber


class FrequencyRead(ScheduleSchema):
    id: int
    route_id: int
    bus_group_id: int | None
    departure_time: time
    resolution_number: str
    route_name: str
    duration_minutes: int | None
    stops: list[str]


class ScheduleBusRead(ScheduleSchema):
    id: int
    number: str
    plate: str
    status: BusStatus
    is_active: bool


class SheetAssignmentInput(ScheduleSchema):
    frequency_id: int = Field(gt=0)
    bus_id: int | None = Field(default=None, gt=0)


class BusStartingLocationInput(ScheduleSchema):
    bus_id: int = Field(gt=0)
    city_id: int = Field(gt=0)


class RouteSheetSave(ScheduleSchema):
    bus_group_id: int = Field(gt=0)
    service_date: date
    assignments: list[SheetAssignmentInput] = Field(max_length=100)
    starting_locations: list[BusStartingLocationInput] = Field(default_factory=list, max_length=100)


class RouteSheetFrequencyRead(ScheduleSchema):
    frequency_id: int
    route_id: int
    route_name: str
    departure_time: time
    duration_minutes: int | None
    resolution_number: str
    stops: list[str]
    bus_id: int | None


class RouteSheetStartingLocationRead(ScheduleSchema):
    bus_id: int
    city_id: int


class RouteSheetRead(ScheduleSchema):
    id: int | None
    bus_group_id: int
    service_date: date
    status: RouteSheetStatus | None
    can_reassign: bool
    frequencies: list[RouteSheetFrequencyRead]
    buses: list[ScheduleBusRead]
    starting_locations: list[RouteSheetStartingLocationRead]