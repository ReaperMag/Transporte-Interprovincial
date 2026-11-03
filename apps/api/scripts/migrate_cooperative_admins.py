"""Assign the cooperative-admin role to an explicitly verified legacy mapping."""

import argparse

from sqlalchemy.orm import Session

from app.core.database import SessionLocal, init_db
from app.modules.roles_permissions.service import assign_legacy_cooperative_admins


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Asigna cooperative_admin solo a correos confirmados como "
            "administradores históricos."
        )
    )
    parser.add_argument("emails", nargs="+", help="Correos de administradores confirmados")
    args = parser.parse_args()

    init_db()
    with SessionLocal() as db:
        try:
            assigned = assign_legacy_cooperative_admins(db, args.emails)
            db.commit()
        except Exception:
            db.rollback()
            raise
    print(f"Roles asignados: {assigned}")


if __name__ == "__main__":
    main()
