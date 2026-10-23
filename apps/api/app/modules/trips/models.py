import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.modules.buses.models import Bus
from app.modules.schedules.models import Frequency, RouteSheet
from app.shared.base_model import str_enum
from app.shared.tenant_model import TenantModel


class TripStatus(enum.StrEnum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class Trip(TenantModel):
    """Viaje concreto: una frecuencia en una fecha con un bus asignado. Es lo que compra el pasajero."""

    __tablename__ = "trips"

    frequency_id: Mapped[int] = mapped_column(ForeignKey("frequencies.id", ondelete="RESTRICT"))
    bus_id: Mapped[int] = mapped_column(ForeignKey("buses.id", ondelete="RESTRICT"))
    route_sheet_id: Mapped[int | None] = mapped_column(
        ForeignKey("route_sheets.id", ondelete="SET NULL")
    )
    departure_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[TripStatus] = mapped_column(str_enum(TripStatus), default=TripStatus.SCHEDULED)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_by_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
    finished_by_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))

    frequency: Mapped[Frequency] = relationship()
    bus: Mapped[Bus] = relationship()
    route_sheet: Mapped[RouteSheet | None] = relationship(back_populates="trips")
