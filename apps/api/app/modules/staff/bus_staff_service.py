from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import BUS_STAFF_POSITIONS
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.accounts.repository import create_account, get_account_by_email
from app.modules.buses.models import Bus
from app.modules.roles_permissions.models import Role
from app.modules.roles_permissions.seed import COOPERATIVE_BUS_STAFF_ROLE
from app.modules.staff.models import Staff, StaffPosition
from app.modules.staff.schemas import AssignedBusRead, BusStaffCreate, BusStaffRead


class BusStaffError(Exception):
    """Error de negocio al gestionar el personal del bus."""


class DuplicateBusStaffError(BusStaffError):
    pass


class BusStaffNotFoundError(BusStaffError):
    pass


class InvalidAssignedBusError(BusStaffError):
    pass


class BusStaffRoleNotConfiguredError(BusStaffError):
    pass


def get_assignable_bus(db: Session, cooperative_id: int, bus_id: int) -> Bus:
    """El bus asignado debe ser un bus activo de la misma cooperativa."""
    bus = db.get(Bus, bus_id)
    if bus is None or bus.cooperative_id != cooperative_id:
        raise InvalidAssignedBusError("El bus no existe en la cooperativa.")
    if not bus.is_active:
        raise InvalidAssignedBusError("No se puede asignar un bus inactivo.")
    return bus


def create_bus_staff(
    db: Session,
    *,
    cooperative_id: int,
    data: BusStaffCreate,
) -> tuple[Staff, str]:
    normalized_email = str(data.email).strip().lower()
    if get_account_by_email(db, normalized_email) is not None:
        raise DuplicateBusStaffError("Ya existe una cuenta con ese correo.")

    if db.scalar(select(Staff.id).where(Staff.id_number == data.id_number)) is not None:
        raise DuplicateBusStaffError("Ya existe un trabajador con esa cédula.")

    get_assignable_bus(db, cooperative_id, data.assigned_bus_id)

    role = db.scalar(select(Role).where(Role.code == COOPERATIVE_BUS_STAFF_ROLE))
    if role is None:
        raise BusStaffRoleNotConfiguredError(
            "El rol del personal del bus no está configurado."
        )

    try:
        account = create_account(
            db,
            email=normalized_email,
            password_hash=hash_password(data.password),
            account_type=AccountType.COOPERATIVE,
            cooperative_id=cooperative_id,
        )
        account.role_id = role.id
        staff = Staff(
            account_id=account.id,
            cooperative_id=cooperative_id,
            first_name=data.first_name,
            last_name=data.last_name,
            id_number=data.id_number,
            phone=data.phone,
            position=StaffPosition(data.position),
            assigned_bus_id=data.assigned_bus_id,
        )
        db.add(staff)
        db.commit()
        db.refresh(staff)
        return staff, account.email
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateBusStaffError(
            "Ya existe una cuenta o trabajador con los datos proporcionados."
        ) from exc
    except Exception:
        db.rollback()
        raise


def _bus_staff_statement(cooperative_id: int):
    return (
        select(Staff, Account.email)
        .join(Account, Account.id == Staff.account_id)
        .where(
            Staff.cooperative_id == cooperative_id,
            Staff.position.in_(BUS_STAFF_POSITIONS),
            Account.cooperative_id == cooperative_id,
            Account.account_type == AccountType.COOPERATIVE,
        )
    )


def list_bus_staff(db: Session, *, cooperative_id: int) -> Sequence[tuple[Staff, str]]:
    statement = _bus_staff_statement(cooperative_id).order_by(
        Staff.last_name,
        Staff.first_name,
        Staff.id,
    )
    return db.execute(statement).all()


def get_bus_staff_member(
    db: Session,
    *,
    cooperative_id: int,
    bus_staff_id: int,
) -> tuple[Staff, str]:
    result = db.execute(
        _bus_staff_statement(cooperative_id).where(Staff.id == bus_staff_id)
    ).first()
    if result is None:
        raise BusStaffNotFoundError("Personal del bus no encontrado.")
    return result


def to_bus_staff_read(db: Session, staff: Staff, email: str) -> BusStaffRead:
    bus = db.get(Bus, staff.assigned_bus_id) if staff.assigned_bus_id else None
    return BusStaffRead(
        id=staff.id,
        account_id=staff.account_id,
        first_name=staff.first_name,
        last_name=staff.last_name,
        id_number=staff.id_number,
        email=email,
        phone=staff.phone,
        position=staff.position.value,
        is_active=staff.is_active,
        assigned_bus=(
            AssignedBusRead(id=bus.id, number=bus.number, plate=bus.plate)
            if bus is not None
            else None
        ),
    )
