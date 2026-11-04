
from argon2 import PasswordHasher
from argon2.exceptions import (
    InvalidHashError,
    VerificationError,
    VerifyMismatchError,
)

# Configuración del algoritmo Argon2id.
password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """
    Genera un hash seguro de la contraseña utilizando Argon2id.

    La contraseña original nunca debe almacenarse
    directamente en la base de datos.
    """
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """
    Comprueba si una contraseña coincide con el hash almacenado.

    Devuelve True si coincide y False si es incorrecta
    o el hash no es válido.
    """
    try:
        return password_hasher.verify(password_hash, password)

    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
