"""Guardado seguro de plantillas de asientos - Issue #66."""

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.modules.buses.models import (
    Bus,
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

    # Determinar si la plantilla original está en uso.
    copied = template_bus_count(
        db,
        cooperative_id,
        template_id,
    ) > 0

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

        db.commit()

    except Exception:
        db.rollback()
        raise

    db.refresh(target)

    return target, copied
