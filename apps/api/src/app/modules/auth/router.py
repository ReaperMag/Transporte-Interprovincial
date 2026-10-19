
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.schemas import SignupRequest, SignupResponse
from app.modules.auth.service import (
    SignupConflictError,
    register_passenger,
)


router = APIRouter(
    prefix="/auth",
    tags=["Autenticación"],
)


@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
)
def signup(
    data: SignupRequest,
    db: Annotated[Session, Depends(get_db)],
) -> SignupResponse:
    """
    Registra una cuenta pública de pasajero.
    """

    try:
        return register_passenger(db, data)

    except SignupConflictError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error
