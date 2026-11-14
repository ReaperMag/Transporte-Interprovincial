"""DPA parish names plus canton seats used as routeable localities.

The source dataset is the Ecuador DPA catalog:
https://github.com/lenekerc98/geoportal-backend/blob/main/data/dpa_ecuador.json
"""

import json
from pathlib import Path
from typing import Final


_LOCALITIES_PATH = Path(__file__).with_name("ecuador_localities.json")
_LOCALITIES_DATA = json.loads(_LOCALITIES_PATH.read_text(encoding="utf-8"))

ECUADOR_LOCALITIES: Final[dict[str, dict[str, tuple[str, ...]]]] = {
    province: {
        canton: tuple(localities)
        for canton, localities in cantons.items()
    }
    for province, cantons in _LOCALITIES_DATA.items()
}
