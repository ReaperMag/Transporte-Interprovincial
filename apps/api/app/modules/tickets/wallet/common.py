
from dataclasses import dataclass
from datetime import datetime

from app.modules.tickets.schemas import TicketRead, TicketValidity


class WalletTicketUnavailableError(ValueError):
    """El boleto no cumple las condiciones para agregarse a Wallet."""


@dataclass(frozen=True, slots=True)
class WalletTicketData:
    """Datos compartidos para generar pases de Google y Apple Wallet."""

    ticket_id: int
    qr_value: str

    cooperative_name: str
    passenger_name: str

    origin_city: str
    destination_city: str

    departure_at: datetime
    issued_at: datetime

    bus_number: str
    seat_number: int
    seat_type: str


def build_wallet_ticket_data(ticket: TicketRead) -> WalletTicketData:
    """
    Prepara los datos de un boleto para Google Wallet y Apple Wallet.

    Solo admite boletos vigentes.
    Conserva el código QR original para que ambos pases puedan
    ser validados por el sistema de transporte.
    """

    if ticket.validity != TicketValidity.VALID:
        raise WalletTicketUnavailableError(
            "Solo puedes agregar a Wallet boletos emitidos y vigentes."
        )

    if not ticket.code or not ticket.code.strip():
        raise WalletTicketUnavailableError(
            "El boleto no tiene un código QR válido."
        )

    return WalletTicketData(
        ticket_id=ticket.id,
        qr_value=ticket.code,
        cooperative_name=ticket.cooperativeName,
        passenger_name=ticket.passengerName,
        origin_city=ticket.originCityName,
        destination_city=ticket.destinationCityName,
        departure_at=ticket.departureAt,
        issued_at=ticket.issuedAt,
        bus_number=ticket.busNumber,
        seat_number=ticket.seatNumber,
        seat_type=ticket.seatType.value,
    )
