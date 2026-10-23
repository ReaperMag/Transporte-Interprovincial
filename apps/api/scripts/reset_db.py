"""
Crea la base de datos con todas las tablas.

Uso (desde apps/api):
    python scripts/reset_db.py          # crea las tablas que falten
    python scripts/reset_db.py --reset  # borra todo y vuelve a crear las tablas
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import init_db, reset_db  # noqa: E402

if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset_db()
        print("Base de datos reiniciada: se borraron los datos y se crearon las tablas.")
    else:
        init_db()
        print("Tablas creadas.")
