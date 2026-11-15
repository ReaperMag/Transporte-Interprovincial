from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import BaseModel


class ChassisBrand(BaseModel):
    __tablename__ = "chassis_brands"
    __table_args__ = (UniqueConstraint("normalized_name", name="uq_chassis_brands_normalized_name"),)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(100), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500))
    origin_country: Mapped[str | None] = mapped_column(String(100))


class BodyworkBrand(BaseModel):
    __tablename__ = "bodywork_brands"
    __table_args__ = (UniqueConstraint("normalized_name", name="uq_bodywork_brands_normalized_name"),)

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(150), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500))
    location: Mapped[str | None] = mapped_column(String(150))
