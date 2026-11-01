from datetime import datetime, time, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import Bus, BusTemplate
from app.modules.cooperatives import service
from app.modules.cooperatives.models import Cooperative
from app.modules.routes.models import City, Route, RouteType
from app.modules.schedules.models import Frequency
from app.modules.trips.models import Trip


PASSWORD = "ClaveCooperativa123!"


def create_cooperative_account(engine, *, name: str, email: str) -> Cooperative:
    with Session(engine) as db:
        cooperative_count = db.scalar(
            select(func.count()).select_from(Cooperative)
        ) or 0
        cooperative = service.create_cooperative(
            db,
            {"name": name, "ruc": str(1234567890001 + cooperative_count)},
        )
        db.add(
            Account(
                email=email,
                password_hash=hash_password(PASSWORD),
                account_type=AccountType.COOPERATIVE,
                cooperative_id=cooperative.id,
            )
        )
        db.commit()
        db.refresh(cooperative)
        return cooperative


def login(client, email: str):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"Origin": settings.frontend_origin},
    )


def test_cooperative_profile_can_be_read_updated_and_persists_after_login(
    test_environment,
):
    client, engine = test_environment
    cooperative = create_cooperative_account(
        engine,
        name="Cooperativa Sierra",
        email="sierra@example.com",
    )
    assert login(client, "sierra@example.com").status_code == 200

    profile_url = "/api/v1/cooperatives/me/profile"
    initial = client.get(profile_url)
    assert initial.status_code == 200
    assert initial.json()["name"] == "Cooperativa Sierra"
    assert initial.json()["ruc"] == "1234567890001"
    assert initial.json()["description"] is None

    changes = {
        "address": "Av. Central 123",
        "phone": "+593 99 123 4567",
        "email": "contacto@sierra.ec",
        "logoUrl": "https://cdn.example.com/logo.png",
        "primaryColor": "#123ABC",
        "secondaryColor": "#fedcba",
        "facebookUrl": "https://facebook.com/sierra",
        "instagramUrl": "https://instagram.com/sierra",
        "tiktokUrl": "https://tiktok.com/@sierra",
        "websiteUrl": "https://sierra.ec",
        "description": "Conectamos las rutas de la sierra.",
    }
    updated = client.patch(
        profile_url,
        json=changes,
        headers={"Origin": settings.frontend_origin},
    )

    assert updated.status_code == 200
    assert updated.json()["name"] == "Cooperativa Sierra"
    assert updated.json()["ruc"] == "1234567890001"
    for key, value in changes.items():
        assert updated.json()[key] == value

    assert client.post(
        "/api/v1/auth/logout",
        headers={"Origin": settings.frontend_origin},
    ).status_code == 204
    assert login(client, "sierra@example.com").status_code == 200
    restored = client.get(profile_url)
    assert restored.status_code == 200
    for key, value in changes.items():
        assert restored.json()[key] == value

    with Session(engine) as db:
        stored = db.get(Cooperative, cooperative.id)
        assert stored is not None
        assert stored.description == changes["description"]


def test_cooperative_route_frequency_summary_is_scoped_to_authenticated_cooperative(
    test_environment,
):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        name="Cooperativa Resumen",
        email="resumen@example.com",
    )
    assert login(client, "resumen@example.com").status_code == 200

    response = client.get("/api/v1/cooperatives/me/route-frequency-summary")

    assert response.status_code == 200
    assert response.json() == {
        "activeRoutes": 0,
        "activeFrequencies": 0,
        "busAssignments": [],
    }


def test_cooperative_route_frequency_summary_requires_cooperative_login(test_environment):
    client, _ = test_environment

    response = client.get("/api/v1/cooperatives/me/route-frequency-summary")

    assert response.status_code == 401


def test_cooperative_route_frequency_summary_shows_bus_trip_assignments(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative_account(
        engine,
        name="Cooperativa Rutas",
        email="rutas@example.com",
    )
    assert login(client, "rutas@example.com").status_code == 200

    with Session(engine) as db:
        origin = City(name="Quito", province="Pichincha")
        destination = City(name="Ambato", province="Tungurahua")
        template = BusTemplate(
            cooperative_id=cooperative.id,
            name="Bus sencillo",
            floors=1,
            has_bathroom=False,
            rows=1,
            columns=1,
        )
        db.add_all([origin, destination, template])
        db.flush()

        route = Route(
            cooperative_id=cooperative.id,
            origin_city_id=origin.id,
            destination_city_id=destination.id,
            route_type=RouteType.DIRECT,
            duration_minutes=120,
        )
        db.add(route)
        db.flush()
        frequency = Frequency(
            cooperative_id=cooperative.id,
            route_id=route.id,
            departure_time=time(9, 30),
            resolution_number="ANT-2026-01",
        )
        bus = Bus(
            cooperative_id=cooperative.id,
            number="42",
            plate="ABC-1234",
            chassis_brand="Hino",
            body_brand="Marcopolo",
            template_id=template.id,
        )
        db.add_all([frequency, bus])
        db.flush()
        db.add(
            Trip(
                cooperative_id=cooperative.id,
                frequency_id=frequency.id,
                bus_id=bus.id,
                departure_at=datetime(2030, 1, 1, 9, 30, tzinfo=timezone.utc),
            )
        )
        db.commit()

    response = client.get("/api/v1/cooperatives/me/route-frequency-summary")

    assert response.status_code == 200
    assert response.json()["activeRoutes"] == 1
    assert response.json()["activeFrequencies"] == 1
    assert response.json()["busAssignments"] == [
        {
            "busId": 1,
            "busNumber": "42",
            "plate": "ABC-1234",
            "routeId": 1,
            "originCity": "Quito",
            "destinationCity": "Ambato",
            "departureTime": "09:30",
            "resolutionNumber": "ANT-2026-01",
            "tripCount": 1,
            "lastDepartureAt": "2030-01-01T09:30:00",
        }
    ]


def test_cooperative_profile_cannot_change_identity_or_another_cooperative(
    test_environment,
):
    client, engine = test_environment
    own = create_cooperative_account(
        engine,
        name="Cooperativa Propia",
        email="propia@example.com",
    )
    other = create_cooperative_account(
        engine,
        name="Cooperativa Ajena",
        email="ajena@example.com",
    )
    assert login(client, "propia@example.com").status_code == 200

    profile_url = "/api/v1/cooperatives/me/profile"
    for protected_payload in (
        {"name": "Nombre alterado"},
        {"ruc": "9999999999999"},
        {"cooperativeId": other.id, "description": "Cambio ajeno"},
    ):
        response = client.patch(
            profile_url,
            json=protected_payload,
            headers={"Origin": settings.frontend_origin},
        )
        assert response.status_code == 422

    assert client.patch(
        f"/api/v1/cooperatives/{other.id}/profile",
        json={"description": "Cambio ajeno"},
        headers={"Origin": settings.frontend_origin},
    ).status_code == 404

    with Session(engine) as db:
        stored_own = db.get(Cooperative, own.id)
        stored_other = db.get(Cooperative, other.id)
        assert stored_own is not None
        assert stored_other is not None
        assert stored_own.name == "Cooperativa Propia"
        assert stored_own.ruc == "1234567890001"
        assert stored_other.description is None

    assert client.post(
        "/api/v1/auth/logout",
        headers={"Origin": settings.frontend_origin},
    ).status_code == 204
    assert login(client, "ajena@example.com").status_code == 200
    assert client.get(profile_url).json()["name"] == "Cooperativa Ajena"


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "correo-inválido"},
        {"phone": "teléfono no válido"},
        {"primaryColor": "azul"},
        {"secondaryColor": "#12345"},
        {"logoUrl": "javascript:alert(1)"},
        {"facebookUrl": "//example.com"},
        {"instagramUrl": "https://"},
        {"websiteUrl": "https://example.com:puerto-inválido"},
    ],
)
def test_cooperative_profile_rejects_invalid_values(test_environment, payload):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        name="Cooperativa Validación",
        email="validacion@example.com",
    )
    assert login(client, "validacion@example.com").status_code == 200

    response = client.patch(
        "/api/v1/cooperatives/me/profile",
        json=payload,
        headers={"Origin": settings.frontend_origin},
    )

    assert response.status_code == 422


def test_cooperative_profile_rejects_unrelated_or_unauthenticated_accounts(
    test_environment,
):
    client, engine = test_environment
    create_cooperative_account(
        engine,
        name="Cooperativa Protegida",
        email="protegida@example.com",
    )

    assert client.get("/api/v1/cooperatives/me/profile").status_code == 401

    with Session(engine) as db:
        db.add(
            Account(
                email="pasajero@example.com",
                password_hash=hash_password(PASSWORD),
                account_type=AccountType.PASSENGER,
            )
        )
        db.commit()

    assert login(client, "pasajero@example.com").status_code == 200
    assert client.get("/api/v1/cooperatives/me/profile").status_code == 403
