"""Guardado seguro de plantillas de asientos - Issue #66."""

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.modules.buses.models import (
    Bus,
    BusStatus,
    BusTemplate,
    CooperativeSeatType,
    TemplateSeat,
)
from app.modules.buses.schemas import BusTemplateCreate


class TemplateNotFoundError(Exception):
    """La plantilla no existe o pertenece a otra cooperativa."""


class TemplateSeatTypeNotFoundError(Exception):
    """El tipo de asiento no pertenece a esta cooperativa."""


def template_bus_count(
    db: Session,
    cooperative_id: int,
    template_id: int,
) -> int:
    """Cuenta cuántos buses de la cooperativa usan la plantilla."""

    return int(
        db.scalar(
            select(func.count(Bus.id)).where(
                Bus.cooperative_id == cooperative_id,
                Bus.template_id == template_id,
            )
        )
        or 0
    )


def save_template(
    db: Session,
    cooperative_id: int,
    template_id: int,
    payload: BusTemplateCreate,
    *,
    commit: bool = True,
) -> tuple[BusTemplate, bool]:
    """
    Si la plantilla está libre, actualiza su contenido.

    Si está asociada a buses, crea una copia sin modificar
    la plantilla original ni reasignar automáticamente buses.

    Retorna (plantilla_guardada, se_creo_copia).
    """

    original = db.scalar(
        select(BusTemplate).where(
            BusTemplate.id == template_id,
            BusTemplate.cooperative_id == cooperative_id,
        )
    )

    if original is None:
        raise TemplateNotFoundError

    # Validar todos los tipos personalizados antes de modificar datos.
    requested_type_ids = {
        seat.seat_type_id
        for seat in payload.seats
        if seat.seat_type_id is not None
    }

    if requested_type_ids:
        valid_type_ids = set(
            db.scalars(
                select(CooperativeSeatType.id).where(
                    CooperativeSeatType.cooperative_id == cooperative_id,
                    CooperativeSeatType.id.in_(requested_type_ids),
                )
            ).all()
        )

        if requested_type_ids != valid_type_ids:
            raise TemplateSeatTypeNotFoundError

    # Una plantilla referenciada por viajes históricos nunca debe modificarse,
    # incluso si ya no está asociada a un bus.
    from app.modules.trips.models import Trip

    historical_trip = db.scalar(
        select(Trip.id).where(Trip.template_id == template_id).limit(1)
    )
    copied = (
        template_bus_count(db, cooperative_id, template_id) > 0
        or historical_trip is not None
    )

    try:
        if copied:
            # La original no se modifica.
            suffix = " (copia)"

            target = BusTemplate(
                cooperative_id=cooperative_id,
                name=payload.name[: 100 - len(suffix)] + suffix,
                floors=payload.floors,
                has_bathroom=payload.has_bathroom,
                rows=payload.rows,
                columns=payload.columns,
            )

            db.add(target)
            db.flush()

        else:
            # No hay buses asociados: editar la plantilla existente.
            target = original

            target.name = payload.name
            target.floors = payload.floors
            target.has_bathroom = payload.has_bathroom
            target.rows = payload.rows
            target.columns = payload.columns

            # Primero eliminar los asientos anteriores.
            # Esto evita conflictos con la restricción UNIQUE
            # de número de asiento dentro de una plantilla.
            db.execute(
                delete(TemplateSeat).where(
                    TemplateSeat.template_id == target.id
                )
            )

            db.flush()
            db.expire(target, ["seats"])

        # Guardar la nueva distribución de forma completa.
        db.add_all(
            [
                TemplateSeat(
                    template_id=target.id,
                    number=seat.number,
                    floor=seat.floor,
                    row=seat.row,
                    column=seat.column,
                    seat_type=seat.seat_type,
                    seat_type_id=seat.seat_type_id,
                )
                for seat in payload.seats
            ]
        )

        if commit:
            db.commit()
        else:
            db.flush()

    except Exception:
        db.rollback()
        raise

    db.refresh(target)

    return target, copied


class TemplateBusNotFoundError(Exception):
    """El bus no pertenece a la cooperativa autenticada."""


class TemplateCapacityError(Exception):
    """La capacidad seleccionada no admite el número de asientos."""


class TemplateBusHasTripsError(Exception):
    """No se puede modificar un plano con viajes pendientes o en curso."""


class TemplateBusNotEditableError(Exception):
    """Solo se editan buses en mantenimiento o fuera de servicio."""


def _same_layout(template: BusTemplate, payload: BusTemplateCreate) -> bool:
    """Distingue cambios de plano de cambios solo en capacidad del vehículo."""
    if (
        template.name != payload.name
        or template.floors != payload.floors
        or template.has_bathroom != payload.has_bathroom
        or template.rows != payload.rows
        or template.columns != payload.columns
        or len(template.seats) != len(payload.seats)
    ):
        return False

    old = sorted(
        (
            seat.number, seat.floor, seat.row, seat.column,
            seat.seat_type, seat.seat_type_id,
        )
        for seat in template.seats
    )
    new = sorted(
        (
            seat.number, seat.floor, seat.row, seat.column,
            seat.seat_type, seat.seat_type_id,
        )
        for seat in payload.seats
    )
    return old == new


def save_bus_template(
    db: Session,
    cooperative_id: int,
    bus_id: int,
    payload: BusTemplateCreate,
    capacity: int,
) -> tuple[BusTemplate, bool, Bus, int]:
    """Actualiza el bus y su plantilla atómicamente.

    Las plantillas asociadas a buses se copian; el bus que se está
    editando se reasigna a esa copia. Otros buses conservan la original.
    """
    from app.modules.trips.models import Trip, TripStatus

    bus = db.scalar(
        select(Bus).where(
            Bus.id == bus_id,
            Bus.cooperative_id == cooperative_id,
        )
    )
    if bus is None:
        raise TemplateBusNotFoundError

    if bus.status not in (BusStatus.MAINTENANCE, BusStatus.OUT_OF_SERVICE):
        raise TemplateBusNotEditableError(
            "Solo puedes editar la plantilla cuando el bus esté "
            "en mantenimiento o fuera de servicio."
        )

    original_id = bus.template_id
    original = db.scalar(
        select(BusTemplate).where(
            BusTemplate.id == original_id,
            BusTemplate.cooperative_id == cooperative_id,
        )
    )
    if original is None:
        raise TemplateNotFoundError

    if len(payload.seats) > capacity:
        raise TemplateCapacityError(
            f"La plantilla contiene {len(payload.seats)} asientos y "
            f"supera la capacidad de {capacity} pasajeros."
        )

    # Cambiar exclusivamente la capacidad no genera una copia inútil.
    layout_changed = not _same_layout(original, payload)

    if layout_changed:
        # Scheduled or running trips can already hold reservations/tickets.
        # Their seat arrangement must not be changed under an active assignment.
        active_trip_id = db.scalar(
            select(Trip.id).where(
                Trip.bus_id == bus_id,
                Trip.status.in_((TripStatus.SCHEDULED, TripStatus.IN_PROGRESS)),
            ).limit(1)
        )
        if active_trip_id is not None:
            raise TemplateBusHasTripsError(
                "El bus tiene viajes programados o en curso. Reasigna o "
                "finaliza esos viajes antes de cambiar su plano."
            )

    try:
        if layout_changed:
            # Retain the original layout for every previously registered trip,
            # including FINISHED/CANCELLED trips without a snapshot yet.
            db.execute(
                update(Trip)
                .where(Trip.bus_id == bus_id, Trip.template_id.is_(None))
                .values(template_id=original_id)
            )
            target, copied = save_template(
                db, cooperative_id, original_id, payload, commit=False
            )
            # La plantilla utilizada por este bus debe producir copia.
            bus.template_id = target.id
            bus.floors = target.floors
        else:
            target, copied = original, False

        bus.passenger_capacity = capacity
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(bus)
    db.refresh(target)
    return target, copied, bus, original_id
