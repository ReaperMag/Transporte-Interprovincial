from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.accounts.models import Account, AccountType
from app.modules.roles_permissions.seed import COOPERATIVE_ADMIN_ROLE, ensure_default_roles
from app.modules.staff.models import Staff


class LegacyAdminMigrationError(ValueError):
    """Raised when an explicit legacy account mapping is not safe to apply."""


def assign_legacy_cooperative_admins(
    db: Session,
    emails: list[str],
) -> int:
    """Idempotently assign admin role to an explicitly verified legacy mapping.

    The caller must provide the mapping obtained from an authoritative source.
    No account is inferred from account type, missing role, or missing Staff row.
    """
    roles = ensure_default_roles(db)
    admin_role = roles[COOPERATIVE_ADMIN_ROLE]
    accounts_to_assign: list[Account] = []

    for raw_email in emails:
        email = raw_email.strip().lower()
        account = db.scalar(select(Account).where(Account.email == email))
        if account is None:
            raise LegacyAdminMigrationError(f"No existe la cuenta indicada: {email}")
        if (
            account.account_type != AccountType.COOPERATIVE
            or account.cooperative_id is None
        ):
            raise LegacyAdminMigrationError(
                f"La cuenta no es una cuenta de cooperativa válida: {email}"
            )
        staff = db.scalar(select(Staff.id).where(Staff.account_id == account.id))
        if staff is not None:
            raise LegacyAdminMigrationError(
                f"La cuenta tiene un perfil Staff y no puede migrarse automáticamente: {email}"
            )
        if account.role_id == admin_role.id:
            continue
        if account.role_id is not None:
            raise LegacyAdminMigrationError(
                f"La cuenta ya tiene otro rol explícito: {email}"
            )
        accounts_to_assign.append(account)

    for account in accounts_to_assign:
        account.role_id = admin_role.id

    return len(accounts_to_assign)