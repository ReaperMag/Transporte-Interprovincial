"""
Vinculación de una cuenta nueva con el pasajero registrado en una venta de
oficina.

Cuando el oficinista vende un boleto, la cédula queda registrada en
passengers sin cuenta. Si esa persona se registra después, puede reclamar
ese registro para ver sus viajes anteriores. La vinculación se concreta solo
cuando verifica su correo.
"""

import unicodedata

from sqlalchemy.orm import Session

from app.modules.accounts.models import Account
from app.modules.passengers.models import Passenger


GENERIC_MISMATCH_MESSAGE = (
    "Los datos no coinciden con el registro existente de esta identificación. "
    "Acércate a una oficina de la cooperativa."
)


class PassengerLinkError(Exception):
    """El registro del pasajero no se puede vincular con la cuenta."""

    def __init__(self, message: str = GENERIC_MISMATCH_MESSAGE):
        super().__init__(message)


def normalize_name(value: str | None) -> str:
    """Compara nombres sin distinguir mayúsculas, tildes ni espacios extra."""
    decomposed = unicodedata.normalize("NFKD", value or "")
    without_accents = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return " ".join(without_accents.casefold().split())


def can_claim_passenger(
    passenger: Passenger,
    *,
    first_name: str,
    last_name: str,
    email: str,
) -> bool:
    """
    Indica si quien se registra puede reclamar el registro de una venta de
    oficina.

    Los nombres y apellidos deben coincidir. Si la venta guardó un correo,
    también debe coincidir con el del registro: así no basta con conocer el
    nombre y la cédula de otra persona para ver sus viajes.
    """
    if passenger.account_id is not None:
        return False

    if normalize_name(passenger.first_name) != normalize_name(first_name):
        return False
    if normalize_name(passenger.last_name) != normalize_name(last_name):
        return False

    if passenger.email and passenger.email.strip().lower() != email.strip().lower():
        return False

    return True


def link_pending_passenger(db: Session, account: Account) -> Passenger | None:
    """
    Concreta la vinculación pendiente cuando la cuenta verifica su correo.

    Conserva la cédula, los nombres y la categoría registrados en la venta y
    solo completa el correo si estaba vacío. Si otra cuenta ya se vinculó
    primero o la venta registró después un correo distinto, no se vincula.
    No confirma la transacción.
    """
    if account.pending_passenger_id is None:
        return None

    passenger = db.get(Passenger, account.pending_passenger_id)
    if (
        passenger is None
        or passenger.account_id is not None
        or (
            passenger.email
            and passenger.email.strip().lower() != account.email.strip().lower()
        )
    ):
        raise PassengerLinkError()

    passenger.account_id = account.id
    if not passenger.email:
        passenger.email = account.email
    account.pending_passenger_id = None
    db.flush()
    return passenger
