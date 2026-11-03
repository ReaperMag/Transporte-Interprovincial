from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.accounts.repository import create_account, get_account_by_email
from app.modules.roles_permissions.models import Role
from app.modules.roles_permissions.seed import COOPERATIVE_CLERK_ROLE
from app.modules.staff.models import Staff, StaffPosition
from app.modules.staff.schemas import OfficeUserCreate


class DuplicateOfficeUserError(Exception):
    """Raised when an office-user identity conflicts with an existing record."""


class ClerkRoleNotConfiguredError(Exception):
    """Raised when the required seeded clerk role is unavailable."""


def create_office_user(
    db: Session,
    *,
    cooperative_id: int,
    data: OfficeUserCreate,
) -> Staff:
    normalized_email = str(data.email).strip().lower()
    if get_account_by_email(db, normalized_email) is not None:
        raise DuplicateOfficeUserError("Ya existe una cuenta con ese correo.")

    if db.scalar(select(Staff.id).where(Staff.id_number == data.id_number)) is not None:
        raise DuplicateOfficeUserError("Ya existe un trabajador con esa cédula.")

    clerk_role = db.scalar(select(Role).where(Role.code == COOPERATIVE_CLERK_ROLE))
    if clerk_role is None:
        raise ClerkRoleNotConfiguredError(
            "El rol de oficinista no está configurado."
        )

    try:
        account = create_account(
            db,
            email=normalized_email,
            password_hash=hash_password(data.password),
            account_type=AccountType.COOPERATIVE,
            cooperative_id=cooperative_id,
        )
        account.role_id = clerk_role.id
        staff = Staff(
            account_id=account.id,
            cooperative_id=cooperative_id,
            first_name=data.first_name,
            last_name=data.last_name,
            id_number=data.id_number,
            phone=data.phone,
            position=StaffPosition.CLERK,
        )
        db.add(staff)
        db.flush()
        db.commit()
        db.refresh(staff)
        return staff
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateOfficeUserError(
            "Ya existe una cuenta o trabajador con los datos proporcionados."
        ) from exc
    except Exception:
        db.rollback()
        raise


def get_staff_account_email(db: Session, staff: Staff) -> str:
    account = db.get(Account, staff.account_id)
    if account is None:
        raise RuntimeError("El perfil de trabajador no tiene una cuenta asociada.")
    return account.email