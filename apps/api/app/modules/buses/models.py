
import enum
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.shared.base_model import BaseModel, str_enum
from app.shared.tenant_model import TenantModel


class SeatType(enum.StrEnum):
    NORMAL = "normal"
    VIP = "vip"


class CooperativeSeatType(TenantModel):
    """Tipo de asiento configurable por cada cooperativa."""

    __tablename__ = "cooperative_seat_types"

    __table_args__ = (
        UniqueConstraint(
            "cooperative_id",
            "normalized_name",
            name="uq_cooperative_seat_types_name",
        ),
        CheckConstraint(
            "percentage >= 0",
            name="ck_cooperative_seat_types_percentage",
        ),
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    normalized_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    percentage: Mapped[Decimal] = mapped_column(
        Numeric(7, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    @validates("name")
    def normalize_name(self, _key: str, value: str) -> str:
        normalized = " ".join(value.split())

        if not normalized:
            raise ValueError(
                "El nombre del tipo de asiento es obligatorio."
            )

        self.normalized_name = normalized.casefold()
        return normalized


class BusOrigin(enum.StrEnum):
    NATIONAL = "nacional"
    IMPORTED = "importado"


class BusStatus(enum.StrEnum):
    OPERATIONAL = "operativo"
    MAINTENANCE = "mantenimiento"
    OUT_OF_SERVICE = "fuera_de_servicio"


class BusTemplate(TenantModel):
    """Plantilla de pisos, baño y distribución de asientos del bus."""

    __tablename__ = "bus_templates"

    name: Mapped[str] = mapped_column(String(100))
    floors: Mapped[int] = mapped_column(default=1)
    has_bathroom: Mapped[bool] = mapped_column(default=False)
    rows: Mapped[int]
    columns: Mapped[int]

    seats: Mapped[list["TemplateSeat"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="TemplateSeat.number",
    )


class TemplateSeat(BaseModel):
    """Asiento con posición en la plantilla y tipo asignado."""

    __tablename__ = "template_seats"

    __table_args__ = (
        UniqueConstraint("template_id", "number"),
    )

    template_id: Mapped[int] = mapped_column(
        ForeignKey("bus_templates.id", ondelete="CASCADE")
    )

    number: Mapped[int]
    floor: Mapped[int] = mapped_column(default=1)
    row: Mapped[int]
    column: Mapped[int]

    seat_type: Mapped[SeatType] = mapped_column(
        str_enum(SeatType),
        default=SeatType.NORMAL,
    )

    # Issue #54: tipo de asiento personalizado por cooperativa.
    seat_type_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "cooperative_seat_types.id",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )

    template: Mapped[BusTemplate] = relationship(
        back_populates="seats"
    )


class BusGroup(TenantModel):
    """Grupo de buses utilizado para su organización y hojas de ruta."""

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
    normalized_name: Mapped[str] = mapped_column(
        String(100),
        default="",
    )
    description: Mapped[str | None] = mapped_column(String(255))

    @validates("name")
    def normalize_name(self, _key: str, value: str) -> str:
        normalized = " ".join(value.split())
        self.normalized_name = normalized.casefold()
        return normalized


class Bus(TenantModel):
    """Bus registrado por una cooperativa."""

    __tablename__ = "buses"

    __table_args__ = (
        UniqueConstraint("cooperative_id", "number"),
    )

    # --------------------------------------------------
    # IDENTIFICACIÓN DEL BUS
    # --------------------------------------------------

    number: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    plate: Mapped[str] = mapped_column(
        String(10),
        unique=True,
    )

    # --------------------------------------------------
    # CHASIS Y CARROCERÍA
    # --------------------------------------------------

    # Nombres históricos.
    # Se conservan incluso si Administración elimina
    # una marca de los catálogos globales.
    chassis_brand: Mapped[str] = mapped_column(
        String(100),
    )

    chassis_number: Mapped[str | None] = mapped_column(
        String(50),
    )

    body_brand: Mapped[str] = mapped_column(
        String(150),
    )

    # --------------------------------------------------
    # ISSUE #63: CATÁLOGOS GLOBALES DE VEHÍCULOS
    # --------------------------------------------------

    # Referencia opcional a la marca de chasis
    # administrada desde el panel Administrador.
    chassis_brand_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "chassis_brands.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    # Referencia opcional a la marca de carrocería
    # administrada desde el panel Administrador.
    bodywork_brand_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "bodywork_brands.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    # --------------------------------------------------
    # DATOS GENERALES DEL BUS
    # --------------------------------------------------

    year: Mapped[int | None]

    photo_url: Mapped[str | None] = mapped_column(
        String(500),
    )

    template_id: Mapped[int] = mapped_column(
        ForeignKey(
            "bus_templates.id",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    group_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "bus_groups.id",
            ondelete="SET NULL",
        ),
    )

    is_active: Mapped[bool] = mapped_column(
        default=True,
    )

    # Campo histórico mantenido por compatibilidad
    # con las funcionalidades existentes.
    brand: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    model: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    passenger_capacity: Mapped[int | None] = mapped_column(
        nullable=True,
    )

    floors: Mapped[int] = mapped_column(
        default=2,
        server_default="2",
    )

    origin: Mapped[BusOrigin | None] = mapped_column(
        str_enum(BusOrigin),
        nullable=True,
    )

    status: Mapped[BusStatus] = mapped_column(
        str_enum(BusStatus),
        default=BusStatus.OPERATIONAL,
        server_default="operativo",
    )

    # --------------------------------------------------
    # RELACIONES
    # --------------------------------------------------

    template: Mapped[BusTemplate] = relationship()

    group: Mapped[BusGroup | None] = relationship()

    photos: Mapped[list["BusPhoto"]] = relationship(
        back_populates="bus",
        cascade="all, delete-orphan",
        order_by="BusPhoto.id",
    )


class BusPhoto(BaseModel):
    """Fotografía asociada a un bus."""

    __tablename__ = "bus_photos"

    bus_id: Mapped[int] = mapped_column(
        ForeignKey(
            "buses.id",
            ondelete="CASCADE",
        )
    )

    file_path: Mapped[str] = mapped_column(
        String(500),
    )

    bus: Mapped[Bus] = relationship(
        back_populates="photos"
    )
