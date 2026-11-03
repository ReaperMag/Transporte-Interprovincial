
import hashlib
import io
import json
import struct
import unittest
import zipfile
import zlib

from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID

from app.modules.tickets.wallet.apple import (
    AppleWalletError,
    build_apple_wallet_pass_json,
    create_apple_wallet_pass,
)
from app.modules.tickets.wallet.common import WalletTicketData


def make_png(width, height):
    """Crea un PNG sencillo para las pruebas, sin dependencias externas."""

    def chunk(name, data):
        return (
            struct.pack(">I", len(data))
            + name
            + data
            + struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)
        )

    pixel = bytes([28, 63, 112, 255])
    raw = b"".join(
        b"\x00" + pixel * width
        for _ in range(height)
    )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(
            b"IHDR",
            struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0),
        )
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
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


class AppleWalletTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        now = datetime.now(timezone.utc)

        cls.root_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )

        cls.signing_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )

        root_name = x509.Name([
            x509.NameAttribute(
                NameOID.COMMON_NAME,
                "Autoridad de pruebas Wallet",
            )
        ])

        signer_name = x509.Name([
            x509.NameAttribute(
                NameOID.COMMON_NAME,
                "Certificado de pruebas Wallet",
            )
        ])

        root_certificate = (
            x509.CertificateBuilder()
            .subject_name(root_name)
            .issuer_name(root_name)
            .public_key(cls.root_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=30))
            .add_extension(
                x509.BasicConstraints(ca=True, path_length=None),
                critical=True,
            )
            .sign(cls.root_key, hashes.SHA256())
        )

        signing_certificate = (
            x509.CertificateBuilder()
            .subject_name(signer_name)
            .issuer_name(root_name)
            .public_key(cls.signing_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=30))
            .sign(cls.root_key, hashes.SHA256())
        )

        cls.signing_certificate_pem = signing_certificate.public_bytes(
            serialization.Encoding.PEM
        )

        cls.wwdr_certificate_pem = root_certificate.public_bytes(
            serialization.Encoding.PEM
        )

        cls.private_key_pem = cls.signing_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )

        cls.icon_png = make_png(29, 29)
        cls.icon_2x_png = make_png(58, 58)

    def create_pass(self, **overrides):
        params = {
            "pass_type_identifier": "pass.com.example.transporte",
            "team_identifier": "TEAMID1234",
            "organization_name": "Transporte Interprovincial",
            "signing_certificate_pem": self.signing_certificate_pem,
            "private_key_pem": self.private_key_pem,
            "wwdr_certificate_pem": self.wwdr_certificate_pem,
            "icon_png": self.icon_png,
            "icon_2x_png": self.icon_2x_png,
        }

        params.update(overrides)

        return create_apple_wallet_pass(
            make_wallet_data(),
            **params,
        )

    def test_construye_boleto_de_autobus(self):
        data = build_apple_wallet_pass_json(
            make_wallet_data(),
            pass_type_identifier="pass.com.example.transporte",
            team_identifier="TEAMID1234",
            organization_name="Transporte Interprovincial",
        )

        self.assertEqual(data["formatVersion"], 1)
        self.assertEqual(
            data["boardingPass"]["transitType"],
            "PKTransitTypeBus",
        )
        self.assertEqual(
            data["barcode"]["message"],
            "codigo-qr-prueba",
        )
        self.assertEqual(
            data["serialNumber"],
            "ticket_15",
        )

    def test_genera_archivo_pkpass_firmado(self):
        result = self.create_pass()

        with zipfile.ZipFile(io.BytesIO(result)) as archive:
            names = set(archive.namelist())

            self.assertEqual(
                names,
                {
                    "pass.json",
                    "manifest.json",
                    "signature",
                    "icon.png",
                    "icon@2x.png",
                },
            )

            manifest = json.loads(archive.read("manifest.json"))

            for filename, digest in manifest.items():
                expected = hashlib.sha1(
                    archive.read(filename)
                ).hexdigest()

                self.assertEqual(digest, expected)

            certificates = pkcs7.load_der_pkcs7_certificates(
                archive.read("signature")
            )

            self.assertGreaterEqual(len(certificates), 2)

    def test_rechaza_clave_privada_incorrecta(self):
        another_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )

        another_private_key = another_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )

        with self.assertRaises(AppleWalletError):
            self.create_pass(
                private_key_pem=another_private_key
            )

    def test_rechaza_imagen_invalida(self):
        with self.assertRaises(AppleWalletError):
            self.create_pass(
                icon_png=b"imagen-no-valida"
            )


if __name__ == "__main__":
    unittest.main()
