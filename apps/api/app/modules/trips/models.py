import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.modules.buses.models import Bus, BusTemplate
from app.modules.schedules.models import Frequency, RouteSheet
from app.shared.base_model import BaseModel, str_enum
from app.shared.tenant_model import TenantModel


class TripStatus(enum.StrEnum):
    SCHEDULED = "scheduled"
    BOARDING = "boarding"  # El personal del bus valida los boletos; la venta está cerrada
    IN_PROGRESS = "in_progress"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class Trip(TenantModel):
    """Viaje concreto: una frecuencia en una fecha con un bus asignado. Es lo que compra el pasajero."""

    __tablename__ = "trips"

    frequency_id: Mapped[int] = mapped_column(ForeignKey("frequencies.id", ondelete="RESTRICT"))
    bus_id: Mapped[int] = mapped_column(ForeignKey("buses.id", ondelete="RESTRICT"))
    # Issue #66: snapshot of the exact seat plan when the trip was assigned.
    # Nullable only to support legacy rows until the additive migration backfills them.
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("bus_templates.id", ondelete="RESTRICT"), nullable=True
    )
    route_sheet_id: Mapped[int | None] = mapped_column(
        ForeignKey("route_sheets.id", ondelete="SET NULL")
    )
    departure_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[TripStatus] = mapped_column(str_enum(TripStatus), default=TripStatus.SCHEDULED)
    boarding_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    boarding_started_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_by_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
    finished_by_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))

    frequency: Mapped[Frequency] = relationship()
    bus: Mapped[Bus] = relationship()
    template: Mapped[BusTemplate | None] = relationship()
    route_sheet: Mapped[RouteSheet | None] = relationship(back_populates="trips")


class TripProblemType(enum.StrEnum):
    DELAY = "delay"  # Retraso
    MECHANICAL = "mechanical"  # Falla mecánica
    OTHER = "other"


class TripProblem(BaseModel):
    """Problema que el personal del bus reporta a la oficina durante un viaje."""

    __tablename__ = "trip_problems"

    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    reported_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )
    problem_type: Mapped[TripProblemType | None] = mapped_column(str_enum(TripProblemType))
    comment: Mapped[str] = mapped_column(String(500))
    # El oficinista lo marca como atendido cuando lo resuelve
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )
