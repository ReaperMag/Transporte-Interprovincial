from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_cooperative_access
from app.modules.accounts.models import Account
from app.modules.buses import bus_service, repository, service
from app.modules.buses.models import BusStatus
from app.modules.buses.schemas import (
    BusCreate,
    BusGroupCreate,
    BusGroupRead,
    BusGroupUpdate,
    BusRead,
    BusStatusUpdate,
    BusUpdate,
)


cooperative_bus_groups_router = APIRouter(
    prefix="/cooperatives/me/groups",
    tags=["Cooperative - Bus groups"],
)

cooperative_buses_router = APIRouter(
    prefix="/cooperatives/me/buses",
    tags=["Cooperative - Buses"],
)


def _require_cooperative_id(account: Account) -> int:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    return account.cooperative_id


def _bus_read(bus) -> BusRead:
    if (
        bus.brand is None
        or bus.model is None
        or bus.year is None
        or bus.passenger_capacity is None
        or bus.origin is None
        or bus.group is None
    ):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="El bus tiene datos incompletos.",
        )
    return BusRead(
        id=bus.id,
        plate=bus.plate,
        brand=bus.brand,
        model=bus.model,
        year=bus.year,
        passenger_capacity=bus.passenger_capacity,
        floors=bus.floors,
        origin=bus.origin,
        status=bus.status,
        group_id=bus.group_id,
        group_name=bus.group.name,
    )


@cooperative_buses_router.get("", response_model=list[BusRead])
def read_buses(
    plate: str | None = Query(default=None, max_length=10),
    group_id: int | None = Query(default=None, alias="groupId"),
    bus_status: BusStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
) -> list[BusRead]:
    cooperative_id = _require_cooperative_id(account)
    return [
        _bus_read(bus)
        for bus in repository.list_buses(
            db,
            cooperative_id,
            plate=plate.strip().upper() if plate else None,
            group_id=group_id,
            status=bus_status.value if bus_status else None,
        )
    ]


@cooperative_buses_router.post("", response_model=BusRead, status_code=status.HTTP_201_CREATED)
def create_cooperative_bus(
    payload: BusCreate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> BusRead:
    try:
        bus = bus_service.create_bus(
            db,
            _require_cooperative_id(account),
            **payload.model_dump(),
        )
    except bus_service.DuplicateBusPlateError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un bus con esa placa.",
        ) from exc
    except bus_service.BusGroupNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El grupo de buses no existe en tu cooperativa.",
        ) from exc
    return _bus_read(bus)


@cooperative_buses_router.patch("/{bus_id}", response_model=BusRead)
def edit_cooperative_bus(
    bus_id: int,
    payload: BusUpdate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> BusRead:
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Envía al menos un campo para actualizar.",
        )
    try:
        bus = bus_service.update_bus(
            db, _require_cooperative_id(account), bus_id, changes
        )
    except bus_service.BusNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bus no encontrado.") from exc
    except bus_service.DuplicateBusPlateError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un bus con esa placa.",
        ) from exc
    except bus_service.BusGroupNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El grupo de buses no existe en tu cooperativa.",
        ) from exc
    return _bus_read(bus)


@cooperative_buses_router.patch("/{bus_id}/status", response_model=BusRead)
def change_cooperative_bus_status(
    bus_id: int,
    payload: BusStatusUpdate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> BusRead:
    try:
        bus = bus_service.update_bus_status(
            db, _require_cooperative_id(account), bus_id, payload.status
        )
    except bus_service.BusNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bus no encontrado.") from exc
    return _bus_read(bus)


@cooperative_buses_router.delete("/{bus_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_cooperative_bus(
    bus_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> Response:
    try:
        bus_service.delete_bus(db, _require_cooperative_id(account), bus_id)
    except bus_service.BusNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bus no encontrado.") from exc
    except bus_service.BusInUseError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar el bus porque tiene relaciones operativas o históricas.",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@cooperative_bus_groups_router.get("", response_model=list[BusGroupRead])
def read_bus_groups(
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
) -> list[BusGroupRead]:
    cooperative_id = _require_cooperative_id(account)
    return [
        BusGroupRead(
            id=group.id,
            name=group.name,
            description=group.description,
            bus_count=bus_count,
        )
        for group, bus_count in repository.list_bus_groups(db, cooperative_id)
    ]


@cooperative_bus_groups_router.post(
    "",
    response_model=BusGroupRead,
    status_code=status.HTTP_201_CREATED,
)
def create_bus_group(
    payload: BusGroupCreate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> BusGroupRead:
    cooperative_id = _require_cooperative_id(account)
    try:
        group = service.create_bus_group(
            db,
            cooperative_id,
            name=payload.name,
            description=payload.description,
        )
    except service.DuplicateBusGroupNameError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un grupo con ese nombre en esta cooperativa.",
        ) from exc

    return BusGroupRead(
        id=group.id,
        name=group.name,
        description=group.description,
        bus_count=0,
    )


@cooperative_bus_groups_router.patch(
    "/{group_id}",
    response_model=BusGroupRead,
)
def edit_bus_group(
    group_id: int,
    payload: BusGroupUpdate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> BusGroupRead:
    cooperative_id = _require_cooperative_id(account)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Envía al menos un campo para actualizar.",
        )
    try:
        group = service.update_bus_group(
            db,
            cooperative_id,
            group_id,
            changes,
        )
    except service.BusGroupNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grupo no encontrado.",
        ) from exc
    except service.DuplicateBusGroupNameError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un grupo con ese nombre en esta cooperativa.",
        ) from exc

    return BusGroupRead(
        id=group.id,
        name=group.name,
        description=group.description,
        bus_count=repository.count_group_buses(db, group.id),
    )


@cooperative_bus_groups_router.delete(
    "/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_bus_group(
    group_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_cooperative_access),
    _: None = Depends(validate_request_origin),
) -> Response:
    cooperative_id = _require_cooperative_id(account)
    try:
        service.delete_bus_group(db, cooperative_id, group_id)
    except service.BusGroupNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grupo no encontrado.",
        ) from exc
    except service.BusGroupInUseError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No se puede eliminar el grupo porque tiene buses o hojas de "
                "ruta asociados."
            ),
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)