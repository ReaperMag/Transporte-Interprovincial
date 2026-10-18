from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel


class TenantModel(BaseModel):
    """Entidad que pertenece a una cooperativa (cada cooperativa solo ve sus propios registros)."""

    __abstract__ = True

    cooperative_id: Mapped[int] = mapped_column(
        ForeignKey("cooperatives.id", ondelete="CASCADE"), index=True
    )
