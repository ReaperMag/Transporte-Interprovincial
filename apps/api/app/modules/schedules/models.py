import enum
from datetime import date, time

from sqlalchemy import Column, Date, ForeignKey, String, Table, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.modules.buses.models import Bus, BusGroup
from app.modules.routes.models import Route
from app.shared.base_model import Base, BaseModel, str_enum
from app.shared.tenant_model import TenantModel


class RouteSheetMode(enum.StrEnum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"


class RouteSheetStatus(enum.StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


class Frequency(TenantModel):
    """Ruta y hora aprobadas por la ANT, por ejemplo Ambato - Quito 14:00."""

    __tablename__ = "frequencies"

    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"))
    bus_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("bus_groups.id", ondelete="CASCADE"), index=True
    )
    departure_time: Mapped[time] = mapped_column(Time)
    # Número de resolución de la ANT; solo es una referencia que ingresa la cooperativa
    resolution_number: Mapped[str] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(default=True)

    route: Mapped[Route] = relationship()
    bus_group: Mapped["BusGroup | None"] = relationship()


# Buses que ese día quedan de parada para cubrir emergencias
route_sheet_standby_buses = Table(
    "route_sheet_standby_buses",
    Base.metadata,
    Column("route_sheet_id", ForeignKey("route_sheets.id", ondelete="CASCADE"), primary_key=True),
    Column("bus_id", ForeignKey("buses.id", ondelete="CASCADE"), primary_key=True),
)


class RouteSheet(TenantModel):
    """Hoja de ruta diaria de un grupo de buses. Cada viaje asignado está en la tabla trips."""

    __tablename__ = "route_sheets"
    __table_args__ = (UniqueConstraint("bus_group_id", "service_date"),)

    bus_group_id: Mapped[int] = mapped_column(ForeignKey("bus_groups.id", ondelete="CASCADE"))
    service_date: Mapped[date] = mapped_column(Date)
    mode: Mapped[RouteSheetMode] = mapped_column(
        str_enum(RouteSheetMode), default=RouteSheetMode.MANUAL
    )
    status: Mapped[RouteSheetStatus] = mapped_column(
        str_enum(RouteSheetStatus), default=RouteSheetStatus.DRAFT
    )
    notes: Mapped[str | None] = mapped_column(String(500))

    standby_buses: Mapped[list[Bus]] = relationship(secondary=route_sheet_standby_buses)
    trips: Mapped[list["Trip"]] = relationship(  # noqa: F821
        back_populates="route_sheet", order_by="Trip.departure_at"
    )


class RouteSheetBusLocation(BaseModel):
    """Ubicación verificada por la cooperativa al iniciar la hoja diaria."""

    __tablename__ = "route_sheet_bus_locations"
    __table_args__ = (UniqueConstraint("route_sheet_id", "bus_id"),)

    route_sheet_id: Mapped[int] = mapped_column(ForeignKey("route_sheets.id", ondelete="CASCADE"))
    bus_id: Mapped[int] = mapped_column(ForeignKey("buses.id", ondelete="CASCADE"))
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id", ondelete="RESTRICT"))

    bus: Mapped[Bus] = relationship()
