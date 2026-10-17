from datetime import time

from sqlalchemy import ForeignKey, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.modules.routes.models import Route
from app.shared.tenant_model import TenantModel


class Frequency(TenantModel):
    """Ruta y hora aprobadas por la ANT, por ejemplo Ambato - Quito 14:00."""

    __tablename__ = "frequencies"

    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"))
    departure_time: Mapped[time] = mapped_column(Time)
    # Número de resolución de la ANT; solo es una referencia que ingresa la cooperativa
    resolution_number: Mapped[str] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(default=True)

    route: Mapped[Route] = relationship()
