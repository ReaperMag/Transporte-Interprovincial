import enum

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base_model import BaseModel, str_enum
from app.shared.tenant_model import TenantModel


class SeatType(enum.StrEnum):
    NORMAL = "normal"
    VIP = "vip"


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
