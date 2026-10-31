from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import API_ROOT, settings


# Tipos de archivo aceptados y la firma con la que empieza cada uno.
ALLOWED_FILE_TYPES = {
    "application/pdf": (".pdf", (b"%PDF",)),
    "image/jpeg": (".jpg", (b"\xff\xd8\xff",)),
    "image/png": (".png", (b"\x89PNG\r\n\x1a\n",)),
}


class InvalidUploadError(Exception):
    """El archivo subido no cumple el tipo o el tamaño permitido."""


def get_uploads_root() -> Path:
    """Carpeta donde se guardan los archivos subidos."""
    root = Path(settings.uploads_dir)
    if not root.is_absolute():
        root = API_ROOT / root
    return root.resolve()


def save_upload(file: UploadFile, folder: str, allowed_types: set[str] | None = None) -> str:
    """
    Valida y guarda un archivo subido con un nombre aleatorio.

    Solo acepta PDF, JPG y PNG dentro del tamaño máximo configurado.
    Revisa el contenido real del archivo, no solo su extensión.
    Devuelve la ruta relativa que se guarda en la base de datos.
    """
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    content = file.file.read(max_bytes + 1)

    if not content:
        raise InvalidUploadError("El archivo está vacío.")

    if len(content) > max_bytes:
        raise InvalidUploadError(
            f"El archivo supera el tamaño máximo de {settings.max_upload_size_mb} MB."
        )

    extension = None
    for content_type, (suffix, signatures) in ALLOWED_FILE_TYPES.items():
        if allowed_types is not None and content_type not in allowed_types:
            continue
        if any(content.startswith(signature) for signature in signatures):
            extension = suffix
            break

    if extension is None:
        if allowed_types == {"image/jpeg", "image/png"}:
            raise InvalidUploadError("Solo se aceptan imagenes JPG o PNG.")
        raise InvalidUploadError("Solo se aceptan archivos PDF, JPG o PNG.")

    target_folder = get_uploads_root() / folder
    target_folder.mkdir(parents=True, exist_ok=True)

    file_name = f"{uuid4().hex}{extension}"
    (target_folder / file_name).write_bytes(content)

    return f"{folder}/{file_name}"


def resolve_upload(relative_path: str) -> Path:
    """
    Devuelve la ruta completa de un archivo guardado,
    sin permitir que salga de la carpeta de archivos subidos.
    """
    root = get_uploads_root()
    path = (root / relative_path).resolve()

    if root not in path.parents or not path.is_file():
        raise FileNotFoundError(relative_path)

    return path
