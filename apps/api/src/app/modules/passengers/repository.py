
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.passengers.models import Passenger


def get_passenger_by_id_number(
    db: Session,
    id_number: str,
) -> Passenger | None:
    """
    Busca un pasajero por su cédula o pasaporte.

    Devuelve el pasajero si existe o None si no existe.
    """
    normalized_id = id_number.strip().upper()

    statement = select(Passenger).where(
        func.upper(Passenger.id_number) == normalized_id
    )

    return db.scalar(statement)


def create_passenger(
    db: Session,
    *,
    id_number: str,
    first_name: str,
    last_name: str,
    email: str,
    account_id: int,
) -> Passenger:
    """
    Agrega un pasajero a la sesión de base de datos.

    No confirma la transacción. El commit será
    responsabilidad del servicio de registro.
    """
    passenger = Passenger(
        id_number=id_number.strip().upper(),
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        email=email.strip().lower(),
        account_id=account_id,
    )

    db.add(passenger)
    db.flush()

    return passenger
