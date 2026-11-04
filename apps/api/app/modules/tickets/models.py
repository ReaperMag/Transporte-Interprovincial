import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.passengers.models import PassengerCategory
from app.shared.base_model import BaseModel, str_enum


class TicketStatus(enum.StrEnum):
    ISSUED = "issued"
    USED = "used"  # Validado al subir al bus; ya no puede volver a usarse
    CANCELLED = "cancelled"


class SaleChannel(enum.StrEnum):
    ONLINE = "online"
    OFFICE = "office"
    ON_BOARD = "on_board"  # Venta extra del chofer durante el viaje


class Ticket(BaseModel):
    """Boleto emitido con su código QR."""

    __tablename__ = "tickets"

    code: Mapped[str] = mapped_column(String(64), unique=True)  # Contenido del código QR
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id", ondelete="RESTRICT"), index=True)
    seat_id: Mapped[int] = mapped_column(ForeignKey("template_seats.id", ondelete="RESTRICT"))
    passenger_id: Mapped[int] = mapped_column(
        ForeignKey("passengers.id", ondelete="RESTRICT"), index=True
    )
    # Nulo en la venta extra del chofer, que no pasa por una reserva
    reservation_seat_id: Mapped[int | None] = mapped_column(
        ForeignKey("reservation_seats.id", ondelete="SET NULL"), unique=True
    )
    channel: Mapped[SaleChannel] = mapped_column(str_enum(SaleChannel))
    origin_city_id: Mapped[int] = mapped_column(ForeignKey("cities.id", ondelete="RESTRICT"))
    # En la venta extra es la parada registrada más cercana al destino real
    destination_city_id: Mapped[int] = mapped_column(ForeignKey("cities.id", ondelete="RESTRICT"))
    passenger_category: Mapped[PassengerCategory] = mapped_column(str_enum(PassengerCategory))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    status: Mapped[TicketStatus] = mapped_column(str_enum(TicketStatus), default=TicketStatus.ISSUED)

    # Datos de la venta extra del chofer
    sold_by_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
    boarding_description: Mapped[str | None] = mapped_column(String(255))  # Lugar donde subió
    destination_description: Mapped[str | None] = mapped_column(String(255))  # A dónde va

    # Validación al subir al bus
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    validated_by_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
