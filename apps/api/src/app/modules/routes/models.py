from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel


class City(BaseModel):
    """Ciudad o parada. Es compartida por todas las cooperativas."""

    __tablename__ = "cities"
    __table_args__ = (UniqueConstraint("name", "province"),)

    name: Mapped[str] = mapped_column(String(100))
    province: Mapped[str] = mapped_column(String(100))
