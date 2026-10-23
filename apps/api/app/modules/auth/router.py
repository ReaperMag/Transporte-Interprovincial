
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.csrf import validate_request_origin
from app.core.database import get_db
from app.core.dependencies import get_current_account
from app.modules.accounts.models import Account
from app.modules.auth.schemas import (
    LoginRequest,
    LoginResponse,
    SignupRequest,
    SignupResponse,
)
from app.modules.auth.service import (
    InvalidCredentialsError,
    SignupConflictError,
    authenticate_account,
    register_passenger,
)

from app.modules.login_attempts.service import (
    is_login_blocked,
    register_failed_login,
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
    """Registra una cuenta pública de pasajero."""

    try:
        return register_passenger(db, data)

    except SignupConflictError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error



@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
)
def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[None, Depends(validate_request_origin)],
) -> LoginResponse:
    """Autentica una cuenta activa y controla los intentos fallidos."""

    # Obtenemos la IP de la conexión.
    # No confiamos en X-Forwarded-For enviado por el cliente.
    ip_address = (
        request.client.host
        if request.client is not None
        else "unknown"
    )

    # 1. Comprobar si alcanzó el límite de intentos.
    if is_login_blocked(db, str(data.email), ip_address):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Inténtalo más tarde.",
        )

    # 2. Verificar las credenciales.
    try:
        account, access_token = authenticate_account(
            db,
            str(data.email),
            data.password,
        )

    except InvalidCredentialsError as error:
        # 3. Registrar el fallo de forma persistente.
        register_failed_login(
            db,
            str(data.email),
            ip_address,
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
        ) from error

    # 4. Establecer la cookie tras autenticar correctamente.
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=access_token,
        max_age=settings.jwt_access_token_expire_minutes * 60,
        path=settings.auth_cookie_path,
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )

    response.headers["Cache-Control"] = "no-store"

    return LoginResponse(
        accountId=account.id,
        email=account.email,
        accountType=account.account_type.value,
    )



@router.get(
    "/me",
    response_model=LoginResponse,
)
def get_me(
    response: Response,
    account: Annotated[Account, Depends(get_current_account)],
) -> LoginResponse:
    """Devuelve información pública de la cuenta autenticada."""

    response.headers["Cache-Control"] = "no-store"

    return LoginResponse(
        accountId=account.id,
        email=account.email,
        accountType=account.account_type.value,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
def logout(
    response: Response,
    _: Annotated[None, Depends(validate_request_origin)],
) -> None:
    """Elimina la cookie de autenticación del navegador."""

    response.delete_cookie(
        key=settings.auth_cookie_name,
        path=settings.auth_cookie_path,
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )

    response.headers["Cache-Control"] = "no-store"
