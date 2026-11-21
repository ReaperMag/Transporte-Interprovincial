from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_bus_staff, require_office_staff
from app.modules.staff.models import Staff
from app.modules.trips import bus_staff_service as service
from app.modules.trips.bus_staff_schemas import (
    BusStaffPassenger,
    BusStaffTripDetail,
    BusStaffTripSummary,
    TicketValidationRequest,
    TicketValidationResult,
    TripProblemCreate,
    TripProblemRead,
)


router = APIRouter(prefix="/bus-staff/trips", tags=["Personal del bus"])
office_problems_router = APIRouter(
    prefix="/cooperatives/me/trip-problems", tags=["Problemas de viajes"]
)


def raise_trip_error(exc: service.BusStaffTripError) -> NoReturn:
    status_codes = {
        service.BusStaffTripNotFoundError: status.HTTP_404_NOT_FOUND,
        service.BusStaffTicketNotFoundError: status.HTTP_404_NOT_FOUND,
        service.TripProblemNotFoundError: status.HTTP_404_NOT_FOUND,
        service.BusStaffTripConflictError: status.HTTP_409_CONFLICT,
    }
    raise HTTPException(
        status_code=status_codes.get(type(exc), status.HTTP_400_BAD_REQUEST),
        detail=str(exc),
    ) from exc


@router.get("", response_model=list[BusStaffTripSummary])
def list_my_trips(
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
):
    """Próximos viajes del bus asignado, con los que están en abordaje o en curso."""
    try:
        trips = service.list_staff_trips(db, staff)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)
    return [service.build_trip_summary(db, trip) for trip in trips]


@router.get("/{trip_id}", response_model=BusStaffTripDetail)
def read_my_trip(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
):
    """Detalle del viaje con la lista de pasajeros y su estado de abordaje."""
    try:
        trip = service.get_staff_trip(db, staff, trip_id)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)
    return service.build_trip_detail(db, trip)


@router.post("/{trip_id}/boarding", response_model=BusStaffTripDetail)
def start_boarding(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
    _: Annotated[None, Depends(validate_request_origin)],
):
    """
    Inicia el abordaje desde 30 minutos antes de la salida. Se cierra la venta
    y se cancelan las reservas sin pagar o con el comprobante sin revisar.
    """
    try:
        trip = service.start_boarding(db, staff, trip_id)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)
    return service.build_trip_detail(db, trip)


@router.post("/{trip_id}/tickets/validate", response_model=TicketValidationResult)
def validate_ticket(
    trip_id: int,
    payload: TicketValidationRequest,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
    _: Annotated[None, Depends(validate_request_origin)],
):
    """
    Valida el código del QR o el escrito a mano. Los boletos con descuento
    devuelven needs_category_check para revisar el documento antes de subir.
    """
    try:
        return service.validate_ticket(db, staff, trip_id, payload.code)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)


@router.post(
    "/{trip_id}/tickets/{ticket_id}/confirm-category",
    response_model=BusStaffPassenger,
)
def confirm_ticket_category(
    trip_id: int,
    ticket_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
    _: Annotated[None, Depends(validate_request_origin)],
):
    """El documento corresponde a la categoría con descuento: la persona sube."""
    try:
        return service.confirm_ticket_category(db, staff, trip_id, ticket_id)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)


@router.post(
    "/{trip_id}/tickets/{ticket_id}/reject-category",
    response_model=BusStaffPassenger,
)
def reject_ticket_category(
    trip_id: int,
    ticket_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
    _: Annotated[None, Depends(validate_request_origin)],
):
    """
    La categoría no corresponde: el boleto queda rechazado, la persona no sube
    y recibe el aviso de cambiarlo en la oficina.
    """
    try:
        return service.reject_ticket_category(db, staff, trip_id, ticket_id)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)


@router.post("/{trip_id}/start", response_model=BusStaffTripDetail)
def start_trip(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
    _: Annotated[None, Depends(validate_request_origin)],
):
    """Inicia el viaje y libera los asientos de quienes no abordaron."""
    try:
        trip = service.start_trip(db, staff, trip_id)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)
    return service.build_trip_detail(db, trip)


@router.post("/{trip_id}/finish", response_model=BusStaffTripDetail)
def finish_trip(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
    _: Annotated[None, Depends(validate_request_origin)],
):
    """Finaliza el viaje en curso con su hora de llegada."""
    try:
        trip = service.finish_trip(db, staff, trip_id)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)
    return service.build_trip_detail(db, trip)


@router.post(
    "/{trip_id}/problems",
    response_model=TripProblemRead,
    status_code=status.HTTP_201_CREATED,
)
def report_problem(
    trip_id: int,
    payload: TripProblemCreate,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
    _: Annotated[None, Depends(validate_request_origin)],
):
    """Reporta un problema del viaje; los oficinistas reciben el aviso."""
    try:
        problem = service.report_problem(db, staff, trip_id, payload)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)
    return service.build_problem_read(db, problem)


@office_problems_router.get("", response_model=list[TripProblemRead])
def list_trip_problems(
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_office_staff)],
    only_open: Annotated[bool, Query(alias="onlyOpen")] = True,
):
    """Problemas reportados por el personal del bus; por defecto, los no atendidos."""
    return [
        service.build_problem_read(db, problem)
        for problem in service.list_cooperative_problems(db, staff, only_open=only_open)
    ]


@office_problems_router.post("/{problem_id}/resolve", response_model=TripProblemRead)
def resolve_trip_problem(
    problem_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_office_staff)],
    _: Annotated[None, Depends(validate_request_origin)],
):
    """Marca el problema como atendido."""
    try:
        problem = service.resolve_problem(db, staff, problem_id)
    except service.BusStaffTripError as exc:
        raise_trip_error(exc)
    return service.build_problem_read(db, problem)
