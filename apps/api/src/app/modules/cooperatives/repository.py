from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.modules.buses.models import Bus
from app.modules.cooperatives.models import Cooperative
from app.modules.routes.models import Route


def list_cooperatives(
    db: Session,
    *,
    search: str | None = None,
    is_active: bool | None = None,
) -> list[Cooperative]:
    statement = select(Cooperative)
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                Cooperative.name.ilike(pattern),
                Cooperative.ruc.ilike(pattern),
                Cooperative.email.ilike(pattern),
            )
        )
    if is_active is not None:
        statement = statement.where(Cooperative.is_active.is_(is_active))
    return list(db.scalars(statement.order_by(Cooperative.name, Cooperative.id)).all())


def get_cooperative(db: Session, cooperative_id: int) -> Cooperative | None:
    return db.get(Cooperative, cooperative_id)


def get_admin_summary(db: Session) -> dict[str, int]:
    return {
        "cooperatives": db.scalar(select(func.count()).select_from(Cooperative)) or 0,
        "routes": db.scalar(select(func.count()).select_from(Route)) or 0,
        "buses": db.scalar(
            select(func.count()).select_from(Bus).where(Bus.is_active.is_(True))
        )
        or 0,
    }