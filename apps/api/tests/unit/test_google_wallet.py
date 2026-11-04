
import unittest
from datetime import datetime, timezone

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.modules.tickets.wallet.common import WalletTicketData
from app.modules.tickets.wallet.google import (
    GoogleWalletError,
    build_google_wallet_object,
    create_google_wallet_url,
)


def make_wallet_data():
    departure = datetime(2026, 12, 1, 13, 0, tzinfo=timezone.utc)

    return WalletTicketData(
        ticket_id=15,
        qr_value="codigo-qr-prueba",
        cooperative_name="Cooperativa de prueba",
        passenger_name="Pasajero de prueba",
        origin_city="Ambato",
        destination_city="Quito",
        departure_at=departure,
        issued_at=departure,
        bus_number="12",
        seat_number=8,
        seat_type="regular",
    )


class GoogleWalletTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        cls.private_key = cls.key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("utf-8")

    def test_construye_objeto_con_datos_reales(self):
        obj = build_google_wallet_object(
            make_wallet_data(),
            issuer_id="123456",
        )

        self.assertEqual(obj["id"], "123456.ticket_15")
        self.assertEqual(
            obj["classId"],
            "123456.interprovincial_ticket",
        )
        self.assertEqual(
            obj["barcode"]["value"],
            "codigo-qr-prueba",
        )

    def test_genera_enlace_firmado(self):
        url = create_google_wallet_url(
            make_wallet_data(),
            issuer_id="123456",
            service_account_email="prueba@example.com",
            private_key=self.private_key,
        )

        self.assertTrue(
            url.startswith("https://pay.google.com/gp/v/save/")
        )

        token = url.rsplit("/", 1)[-1]

        claims = jwt.decode(
            token,
            self.key.public_key(),
            algorithms=["RS256"],
            audience="google",
        )

        self.assertEqual(claims["typ"], "savetowallet")
        self.assertEqual(claims["iss"], "prueba@example.com")
        self.assertEqual(
            claims["payload"]["genericObjects"][0]["id"],
            "123456.ticket_15",
        )

    def test_rechaza_emisor_invalido(self):
        with self.assertRaises(GoogleWalletError):
            build_google_wallet_object(
                make_wallet_data(),
                issuer_id="incorrecto",
            )

    def test_rechaza_credenciales_faltantes(self):
        with self.assertRaises(GoogleWalletError):
            create_google_wallet_url(
                make_wallet_data(),
                issuer_id="123456",
                service_account_email="",
                private_key="",
            )


if __name__ == "__main__":
    unittest.main()
