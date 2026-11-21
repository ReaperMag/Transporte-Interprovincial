from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.core.permissions import (
    _has_role,
    get_office_staff,
    require_bus_staff,
)
from app.modules.accounts.models import Account, AccountType
from app.modules.roles_permissions.seed import COOPERATIVE_ADMIN_ROLE
from app.modules.reports import service
from app.modules.reports.generators.trip_report_pdf import render_trip_report_pdf
from app.modules.reports.schemas import BusTripHistory, TripReport
from app.modules.staff.models import Staff
from app.modules.trips.bus_staff_router import raise_trip_error
from app.modules.trips.bus_staff_service import (
    BusStaffTripError,
    ensure_assigned_bus,
    get_staff_trip,
)


bus_staff_router = APIRouter(prefix="/bus-staff", tags=["Reportes de viaje"])
cooperative_router = APIRouter(prefix="/cooperatives/me", tags=["Reportes de viaje"])


def require_report_reader(
    db: Annotated[Session, Depends(get_db)],
    account: Annotated[Account, Depends(get_current_account)],
) -> int:
    """
    El administrador y el oficinista ven los reportes de todos los buses de su
    cooperativa. Devuelve el id de esa cooperativa.
    """
    is_admin = (
        account.account_type == AccountType.COOPERATIVE
        and account.cooperative_id is not None
        and _has_role(account, db, COOPERATIVE_ADMIN_ROLE)
    )
    if is_admin:
        return account.cooperative_id
    staff = get_office_staff(db, account)
    if staff is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para realizar esta acción.",
        )
    return staff.cooperative_id


def pdf_response(report: TripReport) -> Response:
    return Response(
        content=render_trip_report_pdf(report),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="reporte-viaje-{report.tripId}.pdf"'
        },
    )


def raise_report_error(exc: BusStaffTripError) -> NoReturn:
    if isinstance(exc, (service.TripReportNotFoundError, service.BusNotFoundError)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    raise_trip_error(exc)


@bus_staff_router.get("/trips/{trip_id}/report", response_model=TripReport)
def read_my_trip_report(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
):
    """Reporte de un viaje del bus asignado, desde que empieza el abordaje."""
    try:
        return service.build_trip_report(db, get_staff_trip(db, staff, trip_id))
    except BusStaffTripError as exc:
        raise_report_error(exc)


@bus_staff_router.get(
    "/trips/{trip_id}/report/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def download_my_trip_report(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
):
    """Descarga en PDF el reporte de un viaje del bus asignado."""
    try:
        report = service.build_trip_report(db, get_staff_trip(db, staff, trip_id))
    except BusStaffTripError as exc:
        raise_report_error(exc)
    return pdf_response(report)


@bus_staff_router.get("/history", response_model=BusTripHistory)
def read_my_bus_history(
    db: Annotated[Session, Depends(get_db)],
    staff: Annotated[Staff, Depends(require_bus_staff)],
):
    """Historial de viajes del bus asignado, del más reciente al más antiguo."""
    try:
        bus = service.get_cooperative_bus(db, staff.cooperative_id, ensure_assigned_bus(staff))
    except BusStaffTripError as exc:
        raise_report_error(exc)
    return service.build_bus_history(db, bus)


@cooperative_router.get("/trips/{trip_id}/report", response_model=TripReport)
def read_trip_report(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    cooperative_id: Annotated[int, Depends(require_report_reader)],
):
    """Reporte de cualquier viaje de la cooperativa, desde que empieza el abordaje."""
    try:
        return service.build_trip_report(
            db, service.get_cooperative_trip(db, cooperative_id, trip_id)
        )
    except BusStaffTripError as exc:
        raise_report_error(exc)


@cooperative_router.get(
    "/trips/{trip_id}/report/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def download_trip_report(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    cooperative_id: Annotated[int, Depends(require_report_reader)],
):
    """Descarga en PDF el reporte de un viaje de la cooperativa."""
    try:
        report = service.build_trip_report(
            db, service.get_cooperative_trip(db, cooperative_id, trip_id)
        )
    except BusStaffTripError as exc:
        raise_report_error(exc)
    return pdf_response(report)


@cooperative_router.get("/buses/{bus_id}/history", response_model=BusTripHistory)
def read_bus_history(
    bus_id: int,
    db: Annotated[Session, Depends(get_db)],
    cooperative_id: Annotated[int, Depends(require_report_reader)],
):
    """Historial de viajes de un bus de la cooperativa."""
    try:
        bus = service.get_cooperative_bus(db, cooperative_id, bus_id)
    except BusStaffTripError as exc:
        raise_report_error(exc)
    return service.build_bus_history(db, bus)
