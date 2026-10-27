from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_cooperative_access
from app.modules.accounts.models import Account
from app.modules.buses import repository, service
from app.modules.buses.schemas import BusGroupCreate, BusGroupRead, BusGroupUpdate


cooperative_bus_groups_router = APIRouter(
    prefix="/cooperatives/me/groups",
    tags=["Cooperative - Bus groups"],
)


def _require_cooperative_id(account: Account) -> int:
    if account.cooperative_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no tiene una cooperativa asociada.",
        )
    return account.cooperative_id


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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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