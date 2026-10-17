import enum

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base_model import BaseModel, str_enum
from app.shared.tenant_model import TenantModel


class RouteType(enum.StrEnum):
    DIRECT = "direct"  # Solo se compra desde la ciudad de origen
    WITH_STOPS = "with_stops"  # Se puede comprar entre paradas intermedias


class City(BaseModel):
    """Ciudad o parada. Es compartida por todas las cooperativas."""

    __tablename__ = "cities"
    __table_args__ = (UniqueConstraint("name", "province"),)

    name: Mapped[str] = mapped_column(String(100))
    province: Mapped[str] = mapped_column(String(100))


class Route(TenantModel):
    """Recorrido entre dos ciudades, directo o con paradas intermedias."""

    __tablename__ = "routes"

    origin_city_id: Mapped[int] = mapped_column(ForeignKey("cities.id", ondelete="RESTRICT"))
    destination_city_id: Mapped[int] = mapped_column(ForeignKey("cities.id", ondelete="RESTRICT"))
    route_type: Mapped[RouteType] = mapped_column(str_enum(RouteType))
    duration_minutes: Mapped[int | None]
    is_active: Mapped[bool] = mapped_column(default=True)

    origin_city: Mapped[City] = relationship(foreign_keys=[origin_city_id])
    destination_city: Mapped[City] = relationship(foreign_keys=[destination_city_id])
    stops: Mapped[list["RouteStop"]] = relationship(
        back_populates="route", cascade="all, delete-orphan", order_by="RouteStop.stop_order"
    )


class RouteStop(BaseModel):
    """Parada intermedia de una ruta con paradas, por ejemplo Latacunga en Quito - Loja."""

    __tablename__ = "route_stops"
    __table_args__ = (UniqueConstraint("route_id", "stop_order"),)

    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"))
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id", ondelete="RESTRICT"))
    stop_order: Mapped[int]
    # Minutos desde la salida, para mostrar la hora de cada parada en la hoja de ruta
    minutes_from_origin: Mapped[int | None]

    route: Mapped[Route] = relationship(back_populates="stops")
    city: Mapped[City] = relationship()
