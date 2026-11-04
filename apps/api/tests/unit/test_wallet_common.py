
import unittest
from datetime import datetime, timezone
from decimal import Decimal

from app.modules.buses.models import SeatType
from app.modules.passengers.models import PassengerCategory
from app.modules.tickets.models import SaleChannel, TicketStatus
from app.modules.tickets.schemas import TicketRead, TicketValidity
from app.modules.tickets.wallet.common import (
    WalletTicketUnavailableError,
    build_wallet_ticket_data,
)


def make_ticket(validity=TicketValidity.VALID):
    departure = datetime(2026, 12, 1, 8, 0, tzinfo=timezone.utc)

    return TicketRead(
        id=15,
        code="codigo-de-prueba",
        status=TicketStatus.ISSUED,
        validity=validity,
        channel=SaleChannel.ONLINE,
        reservationId=10,
        tripId=5,
        cooperativeName="Cooperativa de prueba",
        busNumber="12",
        departureAt=departure,
        originCityName="Ambato",
        destinationCityName="Quito",
        seatId=3,
        seatNumber=8,
        seatType=next(iter(SeatType)),
        passengerName="Pasajero de prueba",
        passengerIdNumber="0000000000",
        passengerCategory=next(iter(PassengerCategory)),
        price=Decimal("5.00"),
        issuedAt=departure,
    )


class WalletCommonTests(unittest.TestCase):

    def test_prepara_boleto_vigente(self):
        ticket = make_ticket()

        data = build_wallet_ticket_data(ticket)

        self.assertEqual(data.ticket_id, ticket.id)
        self.assertEqual(data.qr_value, ticket.code)
        self.assertEqual(data.origin_city, "Ambato")
        self.assertEqual(data.destination_city, "Quito")
        self.assertEqual(data.seat_number, 8)

    def test_rechaza_boletos_no_vigentes(self):
        invalid_states = (
            TicketValidity.USED,
            TicketValidity.CANCELLED,
            TicketValidity.EXPIRED,
        )

        for validity in invalid_states:
            with self.subTest(validity=validity):
                ticket = make_ticket(validity)

                with self.assertRaises(WalletTicketUnavailableError):
                    build_wallet_ticket_data(ticket)

    def test_rechaza_boleto_sin_codigo(self):
        ticket = make_ticket().model_copy(update={"code": ""})

        with self.assertRaises(WalletTicketUnavailableError):
            build_wallet_ticket_data(ticket)

    def test_no_incluye_identificacion_personal(self):
        data = build_wallet_ticket_data(make_ticket())

        self.assertFalse(hasattr(data, "passenger_id_number"))


if __name__ == "__main__":
    unittest.main()
