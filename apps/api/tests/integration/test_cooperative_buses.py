import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountType
from app.modules.buses.models import BusGroup, BusTemplate, TemplateSeat
from app.modules.cooperatives.models import Cooperative
from app.modules.staff.models import Staff, StaffPosition


PASSWORD = "ClaveCooperativa123!"
BUSES_URL = "/api/v1/cooperatives/me/buses"
HEADERS = {"Origin": settings.frontend_origin}


def create_cooperative(engine, *, name: str, email: str) -> Cooperative:
    with Session(engine) as db:
        cooperative = Cooperative(
            name=name,
            ruc=f"179{sum(ord(character) for character in email):010d}",
        )
        db.add(cooperative)
        db.flush()

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
        headers=HEADERS,
    )


def create_group(engine, cooperative_id: int, name: str) -> int:
    with Session(engine) as db:
        group = BusGroup(
            cooperative_id=cooperative_id,
            name=name,
            description=None,
        )
        db.add(group)
        db.flush()
        group_id = group.id
        db.commit()
        return group_id


def create_template(
    engine,
    cooperative_id: int,
    name: str = "Plantilla de prueba",
) -> int:
    with Session(engine) as db:
        template = BusTemplate(
            cooperative_id=cooperative_id,
            name=name,
            floors=2,
            has_bathroom=False,
            rows=10,
            columns=4,
        )
        db.add(template)
        db.flush()
        template_id = template.id
        db.commit()
        return template_id


def bus_payload(group_id: int, template_id: int, **changes):
    payload = {
        "number": "025",
        "plate": "ABC-1234",
        "brand": "Hino",
        "model": "AK",
        "year": 2024,
        "capacity": 42,
        "floors": 2,
        "origin": "nacional",
        "status": "operativo",
        "groupId": group_id,
        "templateId": template_id,
    }
    payload.update(changes)
    return payload


def custom_bus_payload(group_id: int, template: dict, **changes):
    payload = bus_payload(group_id, 1, floors=template["floors"], **changes)
    payload.pop("templateId")
    payload["template"] = template
    return payload


def test_cooperative_can_create_filter_update_status_and_delete_bus(
    test_environment,
):
    client, engine = test_environment

    cooperative = create_cooperative(
        engine,
        name="Flota",
        email="flota-bus@example.com",
    )
    group_id = create_group(
        engine, cooperative.id, "Interprovinciales"
    )
    template_id = create_template(engine, cooperative.id)

    assert login(client, "flota-bus@example.com").status_code == 200

    existing_payload = bus_payload(group_id, template_id)
    existing_payload.pop("floors")
    created = client.post(
        BUSES_URL,
        json=existing_payload,
        headers=HEADERS,
    )

    assert created.status_code == 201, created.text
    assert created.json()["number"] == "025"
    assert created.json()["floors"] == 2
    assert created.json()["groupId"] == group_id
    assert created.json()["templateId"] == template_id

    filtered = client.get(f"{BUSES_URL}?plate=abc")
    assert filtered.status_code == 200
    assert filtered.json()[0]["plate"] == "ABC-1234"

    updated = client.patch(
        f"{BUSES_URL}/{created.json()['id']}",
        json={
            "number": " 001 ",
            "model": "AK-2024",
            "status": "mantenimiento",
        },
        headers=HEADERS,
    )

    assert updated.status_code == 200
    assert updated.json()["number"] == "001"
    assert updated.json()["status"] == "mantenimiento"
    assert updated.json()["templateId"] == template_id

    assert client.get(BUSES_URL).json()[0]["number"] == "001"

    removed = client.delete(
        f"{BUSES_URL}/{created.json()['id']}",
        headers=HEADERS,
    )

    assert removed.status_code == 204
    assert client.get(BUSES_URL).json() == []


def test_bus_plates_are_unique_and_groups_are_tenant_scoped(
    test_environment,
):
    client, engine = test_environment

    first = create_cooperative(
        engine,
        name="Primera",
        email="primera-bus@example.com",
    )
    second = create_cooperative(
        engine,
        name="Segunda",
        email="segunda-bus@example.com",
    )

    first_group = create_group(engine, first.id, "Propio")
    second_group = create_group(engine, second.id, "Ajeno")

    first_template = create_template(
        engine, first.id, "Plantilla primera"
    )
    second_template = create_template(
        engine, second.id, "Plantilla segunda"
    )

    assert login(client, "primera-bus@example.com").status_code == 200

    created = client.post(
        BUSES_URL,
        json=bus_payload(first_group, first_template),
        headers=HEADERS,
    )
    assert created.status_code == 201, created.text

    duplicate_plate = client.post(
        BUSES_URL,
        json=bus_payload(
            first_group,
            first_template,
            number="026",
            plate="ABC-1234",
        ),
        headers=HEADERS,
    )
    assert duplicate_plate.status_code == 409

    duplicate_number = client.post(
        BUSES_URL,
        json=bus_payload(
            first_group,
            first_template,
            number="025",
            plate="XYZ-9999",
        ),
        headers=HEADERS,
    )
    assert duplicate_number.status_code == 409

    foreign_group = client.post(
        BUSES_URL,
        json=bus_payload(
            second_group,
            first_template,
            plate="XYZ-9999",
        ),
        headers=HEADERS,
    )
    assert foreign_group.status_code == 404

    assert login(client, "segunda-bus@example.com").status_code == 200

    second_created = client.post(
        BUSES_URL,
        json=bus_payload(
            second_group,
            second_template,
            number="025",
            plate="XYZ-9999",
        ),
        headers=HEADERS,
    )

    assert second_created.status_code == 201, second_created.text
    assert client.get(BUSES_URL).json()[0]["number"] == "025"


def test_bus_validation_rejects_invalid_values(test_environment):
    client, engine = test_environment

    cooperative = create_cooperative(
        engine,
        name="Validación",
        email="validacion-bus@example.com",
    )

    group_id = create_group(engine, cooperative.id, "Validos")
    template_id = create_template(engine, cooperative.id)

    assert login(client, "validacion-bus@example.com").status_code == 200

    invalid = bus_payload(
        group_id,
        template_id,
        number="   ",
        capacity=0,
        floors=1,
        origin="desconocido",
    )

    response = client.post(
        BUSES_URL,
        json=invalid,
        headers=HEADERS,
    )
    assert response.status_code == 422

    blank_update = client.patch(
        f"{BUSES_URL}/999",
        json={"number": "   "},
        headers=HEADERS,
    )
    assert blank_update.status_code == 422


def test_bus_with_staff_assignment_cannot_be_deleted(test_environment):
    client, engine = test_environment

    cooperative = create_cooperative(
        engine,
        name="Protección",
        email="proteccion-bus@example.com",
    )

    group_id = create_group(engine, cooperative.id, "Operativos")
    template_id = create_template(engine, cooperative.id)

    assert login(client, "proteccion-bus@example.com").status_code == 200

    created = client.post(
        BUSES_URL,
        json=bus_payload(
            group_id,
            template_id,
            plate="PRO-0001",
        ),
        headers=HEADERS,
    )
    assert created.status_code == 201, created.text

    with Session(engine) as db:
        db.add(
            Staff(
                cooperative_id=cooperative.id,
                account_id=db.scalar(
                    select(Account.id).where(
                        Account.email == "proteccion-bus@example.com"
                    )
                ),
                first_name="Chofer",
                last_name="Asignado",
                id_number="1712345678",
                position=StaffPosition.DRIVER,
                assigned_bus_id=created.json()["id"],
            )
        )
        db.commit()

    removed = client.delete(
        f"{BUSES_URL}/{created.json()['id']}",
        headers=HEADERS,
    )

    assert removed.status_code == 409


def test_bus_requires_template(test_environment):
    client, engine = test_environment

    cooperative = create_cooperative(
        engine,
        name="Sin plantilla",
        email="sin-plantilla@example.com",
    )
    group_id = create_group(engine, cooperative.id, "Grupo de prueba")
    template_id = create_template(engine, cooperative.id)

    assert login(client, "sin-plantilla@example.com").status_code == 200

    payload = bus_payload(group_id, template_id)
    payload.pop("templateId")

    response = client.post(
        BUSES_URL,
        json=payload,
        headers=HEADERS,
    )

    assert response.status_code == 422

    both_templates = bus_payload(group_id, template_id)
    both_templates["template"] = {
        "name": "Plantilla inline",
        "floors": 2,
        "hasBathroom": False,
        "rows": 1,
        "columns": 1,
        "seats": [
            {"number": 1, "floor": 1, "row": 1, "column": 1, "seatType": "normal"}
        ],
    }
    response = client.post(
        BUSES_URL,
        json=both_templates,
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_bus_rejects_null_template(test_environment):
    client, engine = test_environment

    cooperative = create_cooperative(
        engine,
        name="Plantilla nula",
        email="plantilla-nula@example.com",
    )
    group_id = create_group(engine, cooperative.id, "Grupo de prueba")
    template_id = create_template(engine, cooperative.id)

    assert login(client, "plantilla-nula@example.com").status_code == 200

    response = client.post(
        BUSES_URL,
        json=bus_payload(group_id, template_id, templateId=None),
        headers=HEADERS,
    )

    assert response.status_code == 422


def test_bus_rejects_nonexistent_template(test_environment):
    client, engine = test_environment

    cooperative = create_cooperative(
        engine,
        name="Plantilla inexistente",
        email="plantilla-inexistente@example.com",
    )
    group_id = create_group(engine, cooperative.id, "Grupo de prueba")

    assert login(
        client, "plantilla-inexistente@example.com"
    ).status_code == 200

    response = client.post(
        BUSES_URL,
        json=bus_payload(group_id, 999999),
        headers=HEADERS,
    )

    assert response.status_code == 404


def test_bus_rejects_template_from_another_cooperative(test_environment):
    client, engine = test_environment

    first = create_cooperative(
        engine,
        name="Cooperativa A",
        email="template-a@example.com",
    )
    second = create_cooperative(
        engine,
        name="Cooperativa B",
        email="template-b@example.com",
    )

    group_id = create_group(engine, first.id, "Grupo A")
    foreign_template = create_template(
        engine, second.id, "Plantilla ajena"
    )

    assert login(client, "template-a@example.com").status_code == 200

    response = client.post(
        BUSES_URL,
        json=bus_payload(group_id, foreign_template),
        headers=HEADERS,
    )

    assert response.status_code == 404


def test_cooperative_can_create_bus_with_one_floor_custom_template(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative(
        engine,
        name="Diseño de un piso",
        email="custom-one-floor@example.com",
    )
    group_id = create_group(engine, cooperative.id, "Interprovinciales")
    assert login(client, "custom-one-floor@example.com").status_code == 200

    response = client.post(
        BUSES_URL,
        json=custom_bus_payload(
            group_id,
            {
                "name": "Piso único",
                "floors": 1,
                "hasBathroom": True,
                "rows": 2,
                "columns": 2,
                "seats": [
                    {"number": 1, "floor": 1, "row": 1, "column": 1, "seatType": "normal"},
                    {"number": 2, "floor": 1, "row": 2, "column": 2, "seatType": "vip"},
                ],
            },
            capacity=42,
            plate="ONE-0001",
        ),
        headers=HEADERS,
    )

    assert response.status_code == 201, response.text
    assert response.json()["floors"] == 1
    assert response.json()["capacity"] == 42
    with Session(engine) as db:
        template = db.get(BusTemplate, response.json()["templateId"])
        assert template is not None
        assert template.cooperative_id == cooperative.id
        assert template.floors == 1
        assert template.has_bathroom is True
        assert [(seat.number, seat.floor, seat.row, seat.column, seat.seat_type.value)
                for seat in db.scalars(
                    select(TemplateSeat).where(TemplateSeat.template_id == template.id)
                )] == [
            (1, 1, 1, 1, "normal"),
            (2, 1, 2, 2, "vip"),
        ]


def test_cooperative_can_create_bus_with_two_floor_custom_template(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative(
        engine,
        name="Diseño de dos pisos",
        email="custom-two-floor@example.com",
    )
    group_id = create_group(engine, cooperative.id, "Interprovinciales")
    assert login(client, "custom-two-floor@example.com").status_code == 200

    response = client.post(
        BUSES_URL,
        json=custom_bus_payload(
            group_id,
            {
                "name": "Dos pisos con baño",
                "floors": 2,
                "hasBathroom": True,
                "rows": 2,
                "columns": 3,
                "seats": [
                    {"number": 1, "floor": 1, "row": 1, "column": 1, "seatType": "normal"},
                    {"number": 2, "floor": 1, "row": 2, "column": 1, "seatType": "vip"},
                    {"number": 3, "floor": 2, "row": 1, "column": 2, "seatType": "normal"},
                ],
            },
            capacity=40,
            plate="TWO-0001",
        ),
        headers=HEADERS,
    )

    assert response.status_code == 201, response.text
    assert response.json()["floors"] == 2
    assert response.json()["capacity"] == 40
    with Session(engine) as db:
        template = db.get(BusTemplate, response.json()["templateId"])
        assert template is not None
        assert template.floors == 2
        assert len(
            list(
                db.scalars(
                    select(TemplateSeat).where(TemplateSeat.template_id == template.id)
                )
            )
        ) == 3


def test_custom_template_rejects_invalid_coordinates_and_duplicates(test_environment):
    client, engine = test_environment
    cooperative = create_cooperative(
        engine,
        name="Validar plano",
        email="custom-validation@example.com",
    )
    group_id = create_group(engine, cooperative.id, "Interprovinciales")
    assert login(client, "custom-validation@example.com").status_code == 200

    valid_seat = {"number": 1, "floor": 1, "row": 1, "column": 1, "seatType": "normal"}
    invalid_templates = [
        {
            "name": "Fila fuera",
            "floors": 1,
            "hasBathroom": False,
            "rows": 1,
            "columns": 2,
            "seats": [{**valid_seat, "row": 2}],
        },
        {
            "name": "Piso fuera",
            "floors": 1,
            "hasBathroom": False,
            "rows": 1,
            "columns": 2,
            "seats": [{**valid_seat, "floor": 2}],
        },
        {
            "name": "Número repetido",
            "floors": 1,
            "hasBathroom": False,
            "rows": 1,
            "columns": 2,
            "seats": [
                valid_seat,
                {"number": 1, "floor": 1, "row": 1, "column": 2, "seatType": "vip"},
            ],
        },
        {
            "name": "Posición repetida",
            "floors": 1,
            "hasBathroom": False,
            "rows": 1,
            "columns": 2,
            "seats": [
                valid_seat,
                {"number": 2, "floor": 1, "row": 1, "column": 1, "seatType": "vip"},
            ],
        },
    ]

    for index, template in enumerate(invalid_templates):
        response = client.post(
            BUSES_URL,
            json=custom_bus_payload(
                group_id,
                template,
                number=f"0{index + 1}",
                plate=f"BAD-000{index + 1}",
            ),
            headers=HEADERS,
        )
        assert response.status_code == 422, response.text

    with Session(engine) as db:
        assert db.scalar(
            select(BusTemplate.id).where(BusTemplate.cooperative_id == cooperative.id)
        ) is None


def test_custom_template_creation_is_scoped_to_cooperative_group(test_environment):
    client, engine = test_environment
    first = create_cooperative(
        engine,
        name="Cooperativa propia",
        email="custom-own@example.com",
    )
    second = create_cooperative(
        engine,
        name="Cooperativa ajena",
        email="custom-foreign@example.com",
    )
    foreign_group = create_group(engine, second.id, "Grupo ajeno")
    assert login(client, "custom-own@example.com").status_code == 200

    response = client.post(
        BUSES_URL,
        json=custom_bus_payload(
            foreign_group,
            {
                "name": "Plantilla no persistible",
                "floors": 1,
                "hasBathroom": False,
                "rows": 1,
                "columns": 1,
                "seats": [
                    {"number": 1, "floor": 1, "row": 1, "column": 1, "seatType": "normal"}
                ],
            },
            plate="FOREIGN-1",
        ),
        headers=HEADERS,
    )

    assert response.status_code == 404
    with Session(engine) as db:
        assert db.scalar(
            select(BusTemplate.id).where(BusTemplate.cooperative_id == first.id)
        ) is None

def test_cooperative_can_upload_bus_photos_and_other_tenants_cannot_read_them(
    test_environment, monkeypatch, tmp_path
):
    client, engine = test_environment
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path / "uploads"))
    owner = create_cooperative(
        engine, name="Fotos propia", email="bus-photos-owner@example.com"
    )
    other = create_cooperative(
        engine, name="Fotos ajena", email="bus-photos-other@example.com"
    )
    group_id = create_group(engine, owner.id, "Flota")
    template_id = create_template(engine, owner.id)
    assert login(client, "bus-photos-owner@example.com").status_code == 200

    response = client.post(
        f"{BUSES_URL}/with-photos",
        data={"payload": json.dumps(bus_payload(group_id, template_id))},
        files=[("photos", ("bus.png", b"\x89PNG\r\n\x1a\nimage", "image/png"))],
        headers=HEADERS,
    )

    assert response.status_code == 201, response.text
    bus_id = response.json()["id"]
    photo = response.json()["photos"][0]
    image_response = client.get(photo["url"])
    assert image_response.status_code == 200
    assert image_response.content == b"\x89PNG\r\n\x1a\nimage"
    assert image_response.headers["content-type"] == "image/png"

    assert login(client, "bus-photos-other@example.com").status_code == 200
    assert client.get(photo["url"]).status_code == 404

    assert login(client, "bus-photos-owner@example.com").status_code == 200
    deleted = client.delete(f"{BUSES_URL}/{bus_id}", headers=HEADERS)
    assert deleted.status_code == 204
    assert list((tmp_path / "uploads" / "buses").glob("*")) == []


def test_bus_photo_upload_rejects_non_image_files(test_environment, monkeypatch, tmp_path):
    client, engine = test_environment
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path / "uploads"))
    cooperative = create_cooperative(
        engine, name="Validar fotos", email="bus-photos-validation@example.com"
    )
    group_id = create_group(engine, cooperative.id, "Flota")
    template_id = create_template(engine, cooperative.id)
    assert login(client, "bus-photos-validation@example.com").status_code == 200

    response = client.post(
        f"{BUSES_URL}/with-photos",
        data={"payload": json.dumps(bus_payload(group_id, template_id))},
        files=[("photos", ("not-image.pdf", b"%PDF-1.7", "application/pdf"))],
        headers=HEADERS,
    )

    assert response.status_code == 422
    assert "JPG o PNG" in response.json()["detail"]
    assert client.get(BUSES_URL).json() == []
