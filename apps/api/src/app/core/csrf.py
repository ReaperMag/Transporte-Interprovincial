
from fastapi import HTTPException, Request, status

from app.core.config import settings


def validate_request_origin(request: Request) -> None:
    """
    Verifica el origen de las solicitudes sensibles.

    Rechaza orígenes desconocidos y solicitudes sin
    encabezado Origin.
    """

    origin = request.headers.get("origin")

    if origin != settings.frontend_origin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Origen de solicitud no autorizado.",
        )
