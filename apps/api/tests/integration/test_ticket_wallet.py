
import pytest

from sqlalchemy.orm import Session

from app.modules.tickets.models import Ticket, TicketStatus
from app.modules.tickets.wallet import service as wallet_service
from app.modules.tickets.wallet.service import WalletConfigurationError
from app.modules.trips.models import Trip, TripStatus

from test_payments import payments  # noqa: F401
from test_reservations import login, scenario  # noqa: F401
from test_tickets import online_purchase


@pytest.fixture
def wallet_ticket(payments):
    """
    Crea una compra real de prueba, aprueba su pago
    y obtiene el boleto emitido para el pasajero.
    """

    client, engine, data = payments

    online_purchase(client, data)

    login(client, "ana@example.com")

    response = client.get("/api/v1/tickets/me")

    assert response.status_code == 200, response.text

    tickets = response.json()

    assert len(tickets) == 1
    assert tickets[0]["validity"] == "valid"

    return client, engine, data, tickets[0]


def wallet_urls(ticket_id):
    """Devuelve los endpoints de Google y Apple Wallet."""

    return (
        f"/api/v1/tickets/{ticket_id}/wallet/google",
        f"/api/v1/tickets/{ticket_id}/wallet/apple",
    )


# ============================================================
# PRUEBA 1: AUTENTICACIÓN
# ============================================================

def test_wallet_requiere_autenticacion(wallet_ticket):
    client, _, _, ticket = wallet_ticket

    # Elimina la sesión iniciada durante la compra.
    client.cookies.clear()

    for url in wallet_urls(ticket["id"]):
        response = client.get(url)

        assert response.status_code == 401, response.text


# ============================================================
# PRUEBA 2: PRIVACIDAD DEL BOLETO
# ============================================================

def test_wallet_rechaza_boleto_de_otro_pasajero(wallet_ticket):
    client, _, _, ticket = wallet_ticket

    # Luis intenta acceder al boleto comprado por Ana.
    login(client, "luis@example.com")

    for url in wallet_urls(ticket["id"]):
        response = client.get(url)

        assert response.status_code == 404, response.text


# ============================================================
# PRUEBA 3: ACCESO EXCLUSIVO DE PASAJEROS
# ============================================================

def test_wallet_rechaza_personal_de_oficina(wallet_ticket):
    client, _, _, ticket = wallet_ticket

    login(client, "oficina@andina.ec")

    for url in wallet_urls(ticket["id"]):
        response = client.get(url)

        assert response.status_code == 403, response.text


# ============================================================
# PRUEBA 4: BOLETO INEXISTENTE
# ============================================================

def test_wallet_rechaza_boleto_inexistente(wallet_ticket):
    client, _, _, _ = wallet_ticket

    for url in wallet_urls(99999999):
        response = client.get(url)

        assert response.status_code == 404, response.text


# ============================================================
# PRUEBA 5: VIAJE FINALIZADO
# ============================================================

def test_wallet_rechaza_boleto_vencido(wallet_ticket):
    client, engine, data, ticket = wallet_ticket

    with Session(engine) as db:
        trip = db.get(Trip, data["trip_id"])

        trip.status = TripStatus.FINISHED

        db.commit()

    for url in wallet_urls(ticket["id"]):
        response = client.get(url)

        assert response.status_code == 409, response.text


# ============================================================
# PRUEBA 6: BOLETOS UTILIZADOS Y CANCELADOS
# ============================================================

@pytest.mark.parametrize(
    "ticket_status",
    [
        TicketStatus.USED,
        TicketStatus.CANCELLED,
    ],
)
def test_wallet_rechaza_boleto_no_vigente(
    wallet_ticket,
    ticket_status,
):
    client, engine, _, ticket = wallet_ticket

    with Session(engine) as db:
        db_ticket = db.get(Ticket, ticket["id"])

        db_ticket.status = ticket_status

        db.commit()

    for url in wallet_urls(ticket["id"]):
        response = client.get(url)

        assert response.status_code == 409, response.text


# ============================================================
# PRUEBA 7: WALLET SIN CONFIGURACIÓN
# ============================================================

def test_wallet_responde_503_si_falta_configuracion(
    wallet_ticket,
    monkeypatch,
):
    client, _, _, ticket = wallet_ticket

    def unavailable(_ticket):
        raise WalletConfigurationError(
            "Credenciales no disponibles durante la prueba."
        )

    monkeypatch.setattr(
        wallet_service,
        "build_google_wallet_link",
        unavailable,
    )

    monkeypatch.setattr(
        wallet_service,
        "build_apple_wallet_file",
        unavailable,
    )

    for url in wallet_urls(ticket["id"]):
        response = client.get(url)

        assert response.status_code == 503, response.text

        assert "no está disponible" in response.json()["detail"]


# ============================================================
# PRUEBA 8: RESPUESTA EXITOSA DE GOOGLE WALLET
# ============================================================

def test_google_wallet_devuelve_enlace(
    wallet_ticket,
    monkeypatch,
):
    client, _, _, ticket = wallet_ticket

    expected_url = (
        "https://pay.google.com/gp/v/save/"
        "token-de-prueba"
    )

    def fake_google_wallet(ticket_read):
        assert ticket_read.id == ticket["id"]
        assert ticket_read.code == ticket["code"]
        assert ticket_read.validity == "valid"

        return expected_url

    monkeypatch.setattr(
        wallet_service,
        "build_google_wallet_link",
        fake_google_wallet,
    )

    response = client.get(
        f"/api/v1/tickets/{ticket['id']}/wallet/google"
    )

    assert response.status_code == 200, response.text

    assert response.json() == {
        "url": expected_url,
    }

    assert response.headers["cache-control"] == (
        "private, no-store"
    )


# ============================================================
# PRUEBA 9: RESPUESTA EXITOSA DE APPLE WALLET
# ============================================================

def test_apple_wallet_devuelve_archivo(
    wallet_ticket,
    monkeypatch,
):
    client, _, _, ticket = wallet_ticket

    # Contenido simulado para probar la respuesta HTTP.
    # No representa un pase Apple Wallet válido.
    fake_pass = b"PK\x03\x04archivo-de-prueba"

    def fake_apple_wallet(ticket_read):
        assert ticket_read.id == ticket["id"]
        assert ticket_read.code == ticket["code"]
        assert ticket_read.validity == "valid"

        return fake_pass

    monkeypatch.setattr(
        wallet_service,
        "build_apple_wallet_file",
        fake_apple_wallet,
    )

    response = client.get(
        f"/api/v1/tickets/{ticket['id']}/wallet/apple"
    )

    assert response.status_code == 200, response.text

    assert response.content == fake_pass

    assert response.headers["content-type"] == (
        "application/vnd.apple.pkpass"
    )

    assert response.headers["content-disposition"] == (
        f'attachment; filename="boleto-{ticket["id"]}.pkpass"'
    )

    assert response.headers["cache-control"] == (
        "private, no-store"
    )

    assert response.headers["x-content-type-options"] == (
        "nosniff"
    )
