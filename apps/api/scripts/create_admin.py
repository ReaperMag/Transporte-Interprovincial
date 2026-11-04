"""Create the initial super-admin account if the configured database has none.

Usage (from apps/api):
    python scripts/create_admin.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.bootstrap import ensure_initial_admin  # noqa: E402
from app.core.database import SessionLocal, init_db  # noqa: E402


def main() -> None:
    init_db()
    with SessionLocal() as db:
        created = ensure_initial_admin(db)
    print(
        "Administrador inicial creado."
        if created
        else "Ya existe un administrador; no se modificó ninguna cuenta."
    )


if __name__ == "__main__":
    main()
