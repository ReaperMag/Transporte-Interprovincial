"""
Validaciones compartidas para los datos que ingresan los usuarios.

Se usan en los esquemas de todos los módulos para que una misma regla, como
la cédula ecuatoriana o el teléfono, se revise igual en cualquier formulario.
"""

import re
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, EmailStr


# Provincias 01 a 24 y 30 para ecuatorianos registrados en el exterior.
VALID_PROVINCE_CODES = {*range(1, 25), 30}

NAME_PATTERN = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '\-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$")
PHONE_PATTERN = re.compile(r"^\+?\d{7,15}$")
PLATE_PATTERN = re.compile(r"^[A-Z]{3}-\d{3,4}$")


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


def validate_cedula(value: str) -> str:
    """Valida una cédula ecuatoriana de persona natural con su dígito verificador."""
    if not re.fullmatch(r"\d{10}", value):
        raise ValueError("La cédula debe tener exactamente 10 números.")

    province = int(value[:2])
    third_digit = int(value[2])
    if province not in VALID_PROVINCE_CODES or third_digit > 5:
        raise ValueError("La cédula ecuatoriana no es válida.")

    total = 0
    for index, character in enumerate(value[:9]):
        digit = int(character)
        if index % 2 == 0:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit

    verifier = (10 - total % 10) % 10
    if verifier != int(value[9]):
        raise ValueError("La cédula ecuatoriana no es válida.")
    return value


def validate_ruc(value: str) -> str:
    """
    Valida la estructura de un RUC ecuatoriano.

    Revisa los 13 números, la provincia, el tipo de contribuyente y el
    establecimiento. Para personas naturales también revisa la cédula.
    """
    if not re.fullmatch(r"\d{13}", value):
        raise ValueError("El RUC debe tener exactamente 13 números.")

    province = int(value[:2])
    third_digit = int(value[2])
    if province not in VALID_PROVINCE_CODES or third_digit not in {0, 1, 2, 3, 4, 5, 6, 9}:
        raise ValueError("El RUC ecuatoriano no es válido.")
    if value[-3:] == "000":
        raise ValueError("El RUC ecuatoriano no es válido.")
    if third_digit <= 5:
        try:
            validate_cedula(value[:10])
        except ValueError as exc:
            raise ValueError("El RUC ecuatoriano no es válido.") from exc
    return value


def validate_phone(value: str) -> str:
    """
    Acepta solo números, con un + opcional al inicio, de 7 a 15 dígitos.
    Los espacios y guiones para separar los grupos se permiten y se conservan.
    """
    compact = re.sub(r"[ -]", "", value)
    if not PHONE_PATTERN.fullmatch(compact):
        raise ValueError("El teléfono solo puede tener números, de 7 a 15 dígitos.")
    return value


def validate_person_name(value: str) -> str:
    """Nombres y apellidos: solo letras, espacios, apóstrofos y guiones."""
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError("El nombre no puede estar vacío.")
    if not NAME_PATTERN.fullmatch(normalized):
        raise ValueError("El nombre solo puede tener letras.")
    return normalized


def validate_place_name(value: str) -> str:
    """Ciudades y provincias: solo letras y espacios."""
    normalized = " ".join(value.split())
    if not NAME_PATTERN.fullmatch(normalized):
        raise ValueError("El nombre del lugar solo puede tener letras.")
    return normalized


def validate_email_domain(value: str) -> str:
    """El correo debe tener un dominio completo, por ejemplo usuario@gmail.com."""
    if not EMAIL_PATTERN.fullmatch(value):
        raise ValueError("Ingresa un correo con dominio, por ejemplo usuario@gmail.com.")
    return value


def validate_plate(value: str) -> str:
    """Placa ecuatoriana: tres letras y tres o cuatro números, por ejemplo PBA-1234."""
    normalized = value.upper().replace(" ", "")
    if re.fullmatch(r"[A-Z]{3}\d{3,4}", normalized):
        normalized = f"{normalized[:3]}-{normalized[3:]}"
    if not PLATE_PATTERN.fullmatch(normalized):
        raise ValueError("La placa debe tener tres letras y tres o cuatro números, por ejemplo PBA-1234.")
    return normalized


def validate_digits(value: str) -> str:
    """Campos que solo admiten números, como el número de disco."""
    if not re.fullmatch(r"\d+", value):
        raise ValueError("Este campo solo puede tener números.")
    return value


Cedula = Annotated[str, BeforeValidator(_strip), AfterValidator(validate_cedula)]
Ruc = Annotated[str, BeforeValidator(_strip), AfterValidator(validate_ruc)]
Phone = Annotated[str, BeforeValidator(_strip), AfterValidator(validate_phone)]
PersonName = Annotated[str, BeforeValidator(_strip), AfterValidator(validate_person_name)]
PlaceName = Annotated[str, BeforeValidator(_strip), AfterValidator(validate_place_name)]
Plate = Annotated[str, BeforeValidator(_strip), AfterValidator(validate_plate)]
Digits = Annotated[str, BeforeValidator(_strip), AfterValidator(validate_digits)]
EmailWithDomain = Annotated[
    EmailStr,
    BeforeValidator(_strip),
    AfterValidator(validate_email_domain),
]
