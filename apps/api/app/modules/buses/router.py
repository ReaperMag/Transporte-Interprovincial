from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.permissions import require_cooperative_access
from app.modules.accounts.models import Account
from app.modules.buses import repository, service
from app.modules.buses.schemas import BusGroupCreate, BusGroupRead


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