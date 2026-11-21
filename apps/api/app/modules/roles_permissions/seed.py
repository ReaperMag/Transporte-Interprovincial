from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.roles_permissions.models import Role


COOPERATIVE_ADMIN_ROLE = "cooperative_admin"
COOPERATIVE_CLERK_ROLE = "cooperative_clerk"
COOPERATIVE_BUS_STAFF_ROLE = "cooperative_bus_staff"


DEFAULT_ROLES = (
    (
        COOPERATIVE_ADMIN_ROLE,
        "Administrador de cooperativa",
        "Administra la configuración y los recursos de su cooperativa.",
    ),
    (
        COOPERATIVE_CLERK_ROLE,
        "Oficinista de cooperativa",
        "Opera ventas, reservas y comprobantes de su cooperativa.",
    ),
    (
        COOPERATIVE_BUS_STAFF_ROLE,
        "Personal del bus",
        "Conductor o controlador: maneja los viajes del bus que tiene asignado.",
    ),
)


def ensure_default_roles(db: Session) -> dict[str, Role]:
    """Create the stable cooperative roles without changing existing assignments."""
    roles: dict[str, Role] = {}
    for code, name, description in DEFAULT_ROLES:
        role = db.scalar(select(Role).where(Role.code == code))
        if role is None:
            role = Role(code=code, name=name, description=description)
            db.add(role)
            db.flush()
        roles[code] = role
    return roles