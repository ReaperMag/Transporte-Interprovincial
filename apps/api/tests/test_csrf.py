
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.config import settings
from app.core.csrf import validate_request_origin


def make_request(origin: str | None) -> Request:
    headers = []

    if origin is not None:
        headers.append(
            (b"origin", origin.encode("utf-8"))
        )

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/auth/logout",
        "headers": headers,
        "query_string": b"",
    }

    return Request(scope)


def test_accept_authorized_origin():
    request = make_request(settings.frontend_origin)

    validate_request_origin(request)


def test_reject_unknown_origin():
    request = make_request("https://sitio-desconocido.example")

    with pytest.raises(HTTPException) as error:
        validate_request_origin(request)

    assert error.value.status_code == 403


def test_reject_missing_origin():
    request = make_request(None)

    with pytest.raises(HTTPException) as error:
        validate_request_origin(request)

    assert error.value.status_code == 403
