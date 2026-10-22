from fastapi import HTTPException, status

from app.core.config import settings


def require_admin_access() -> None:
    """Keep admin routes closed until real authentication and role checks are wired."""
    if not settings.allow_unauthenticated_admin:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API is disabled until authentication is configured.",
        )