import enum

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.shared.base_model import BaseModel, str_enum
from app.shared.tenant_model import TenantModel


class SeatType(enum.StrEnum):
    NORMAL = "normal"
    VIP = "vip"


class BusOrigin(enum.StrEnum):
    NATIONAL = "nacional"
    IMPORTED = "importado"


class BusStatus(enum.StrEnum):
    OPERATIONAL = "operativo"
    MAINTENANCE = "mantenimiento"
    OUT_OF_SERVICE = "fuera_de_servicio"


class BusTemplate(TenantModel):
    """Plantilla de estructura del bus: pisos, baño y distribución de asientos."""

    __tablename__ = "bus_templates"

    name: Mapped[str] = mapped_column(String(100))
    floors: Mapped[int] = mapped_column(default=1)
    has_bathroom: Mapped[bool] = mapped_column(default=False)
    rows: Mapped[int]
    columns: Mapped[int]

    seats: Mapped[list["TemplateSeat"]] = relationship(
        back_populates="template", cascade="all, delete-orphan", order_by="TemplateSeat.number"
    )


class TemplateSeat(BaseModel):
    """Asiento dentro de una plantilla, con su posición en la cuadrícula y su tipo."""

    __tablename__ = "template_seats"
    __table_args__ = (UniqueConstraint("template_id", "number"),)

    template_id: Mapped[int] = mapped_column(ForeignKey("bus_templates.id", ondelete="CASCADE"))
    number: Mapped[int]
    floor: Mapped[int] = mapped_column(default=1)
    row: Mapped[int]
    column: Mapped[int]
    seat_type: Mapped[SeatType] = mapped_column(str_enum(SeatType), default=SeatType.NORMAL)

    template: Mapped[BusTemplate] = relationship(back_populates="seats")


class BusGroup(TenantModel):
    """Grupo de buses, por ejemplo 'Buses cómodos' o 'Buses cantonales'. La hoja de ruta es por grupo."""

    __tablename__ = "bus_groups"
    __table_args__ = (
        Index(
            "uq_bus_groups_cooperative_normalized_name",
            "cooperative_id",
            "normalized_name",
            unique=True,
        ),
    )

    name: Mapped[str] = mapped_column(String(100))
    normalized_name: Mapped[str] = mapped_column(String(100), default="")
    description: Mapped[str | None] = mapped_column(String(255))

    @validates("name")
    def normalize_name(self, _key: str, value: str) -> str:
        normalized = " ".join(value.split())
        self.normalized_name = normalized.casefold()
        return normalized


class Bus(TenantModel):
    __tablename__ = "buses"
    __table_args__ = (UniqueConstraint("cooperative_id", "number"),)

    number: Mapped[str | None] = mapped_column(String(10), nullable=True)  # Número de disco
    plate: Mapped[str] = mapped_column(String(10), unique=True)
    chassis_brand: Mapped[str] = mapped_column(String(50))
    chassis_number: Mapped[str | None] = mapped_column(String(50))
    body_brand: Mapped[str] = mapped_column(String(50))  # Carrocería
    year: Mapped[int | None]
    photo_url: Mapped[str | None] = mapped_column(String(500))
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("bus_templates.id", ondelete="RESTRICT"), nullable=True
    )
    group_id: Mapped[int | None] = mapped_column(ForeignKey("bus_groups.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(default=True)
    brand: Mapped[str | None] = mapped_column(String(50), nullable=True)
    model: Mapped[str | None] = mapped_column(String(50), nullable=True)
    passenger_capacity: Mapped[int | None] = mapped_column(nullable=True)
    floors: Mapped[int] = mapped_column(default=2, server_default="2")
    origin: Mapped[BusOrigin | None] = mapped_column(
        str_enum(BusOrigin), nullable=True
    )
    status: Mapped[BusStatus] = mapped_column(
        str_enum(BusStatus), default=BusStatus.OPERATIONAL, server_default="operativo"
    )

    template: Mapped[BusTemplate] = relationship()
    group: Mapped[BusGroup | None] = relationship()
