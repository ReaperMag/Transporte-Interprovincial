from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.accounts.repository import create_account, get_account_by_email
from app.modules.roles_permissions.models import Role
from app.modules.roles_permissions.seed import COOPERATIVE_CLERK_ROLE
from app.modules.staff.models import Staff, StaffPosition
from app.modules.staff.schemas import OfficeUserCreate, OfficeUserUpdate


class DuplicateOfficeUserError(Exception):
    """Raised when an office-user identity conflicts with an existing record."""


class ClerkRoleNotConfiguredError(Exception):
    """Raised when the required seeded clerk role is unavailable."""


class OfficeUserNotFoundError(Exception):
    """Raised when a clerk is not visible to the requested cooperative."""


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


def _clerk_statement(cooperative_id: int):
    return (
        select(Staff, Account.email)
        .join(Account, Account.id == Staff.account_id)
        .where(
            Staff.cooperative_id == cooperative_id,
            Staff.position == StaffPosition.CLERK,
            Account.cooperative_id == cooperative_id,
            Account.account_type == AccountType.COOPERATIVE,
        )
    )


def list_office_users(
    db: Session,
    *,
    cooperative_id: int,
) -> Sequence[tuple[Staff, str]]:
    statement = _clerk_statement(cooperative_id).order_by(
        Staff.last_name,
        Staff.first_name,
        Staff.id,
    )
    return db.execute(statement).all()


def get_office_user(
    db: Session,
    *,
    cooperative_id: int,
    office_user_id: int,
) -> tuple[Staff, str]:
    result = db.execute(
        _clerk_statement(cooperative_id).where(Staff.id == office_user_id)
    ).first()
    if result is None:
        raise OfficeUserNotFoundError
    return result


def update_office_user(
    db: Session,
    *,
    cooperative_id: int,
    office_user_id: int,
    data: OfficeUserUpdate,
) -> tuple[Staff, str]:
    staff, email = get_office_user(
        db,
        cooperative_id=cooperative_id,
        office_user_id=office_user_id,
    )
    account = db.get(Account, staff.account_id)
    if account is None:
        raise OfficeUserNotFoundError

    changes = data.model_dump(exclude_unset=True)
    normalized_email = (
        str(changes["email"]).strip().lower()
        if "email" in changes
        else account.email
    )
    if db.scalar(
        select(Account.id).where(
            func.lower(Account.email) == normalized_email,
            Account.id != account.id,
        )
    ) is not None:
        raise DuplicateOfficeUserError("Ya existe una cuenta con ese correo.")

    if "id_number" in changes and db.scalar(
        select(Staff.id).where(
            Staff.id_number == changes["id_number"],
            Staff.id != staff.id,
        )
    ) is not None:
        raise DuplicateOfficeUserError("Ya existe un trabajador con esa cédula.")

    try:
        if "email" in changes:
            account.email = normalized_email
        for field in ("first_name", "last_name", "id_number", "phone"):
            if field in changes:
                setattr(staff, field, changes[field])
        db.flush()
        db.commit()
        db.refresh(staff)
        return staff, account.email
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateOfficeUserError(
            "Ya existe una cuenta o trabajador con los datos proporcionados."
        ) from exc
    except Exception:
        db.rollback()
        raise