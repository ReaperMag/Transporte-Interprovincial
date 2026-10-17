from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.tenant_model import TenantModel


class BusTemplate(TenantModel):
    """Plantilla de estructura del bus: pisos, baño y distribución de asientos."""

    __tablename__ = "bus_templates"

    name: Mapped[str] = mapped_column(String(100))
    floors: Mapped[int] = mapped_column(default=1)
    has_bathroom: Mapped[bool] = mapped_column(default=False)
    rows: Mapped[int]
    columns: Mapped[int]
