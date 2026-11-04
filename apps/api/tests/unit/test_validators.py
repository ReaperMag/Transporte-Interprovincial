import pytest

from app.core.validators import (
    validate_cedula,
    validate_digits,
    validate_email_domain,
    validate_person_name,
    validate_phone,
    validate_place_name,
    validate_plate,
    validate_ruc,
)


@pytest.mark.parametrize("value", ["1712345675", "0900000001", "1800000000", "3000000012"])
def test_valid_ecuadorian_cedulas(value):
    assert validate_cedula(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "1712345678",  # dígito verificador incorrecto
        "171234567",  # nueve números
        "17123456751",  # once números
        "17A2345675",  # letras
        "2512345678",  # provincia inexistente
        "1762345675",  # tercer dígito de sociedad
        "",
    ],
)
def test_invalid_ecuadorian_cedulas(value):
    with pytest.raises(ValueError):
        validate_cedula(value)


@pytest.mark.parametrize("value", ["1790011223001", "1712345675001", "1760001550001"])
def test_valid_rucs(value):
    assert validate_ruc(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "1790011223000",  # establecimiento 000
        "1712345678001",  # cédula inválida en un RUC de persona natural
        "179001122300",  # doce números
        "17900112230A1",  # letras
        "9990011223001",  # provincia inexistente
        "1770011223001",  # tercer dígito no permitido
    ],
)
def test_invalid_rucs(value):
    with pytest.raises(ValueError):
        validate_ruc(value)


@pytest.mark.parametrize("value", ["0991234567", "022345678", "+593991234567", "+593 99 123 4567"])
def test_valid_phones(value):
    assert validate_phone(value) == value


@pytest.mark.parametrize("value", ["099123456a", "teléfono", "12345", "(02) 234-5678", "+59399123456789012"])
def test_invalid_phones(value):
    with pytest.raises(ValueError):
        validate_phone(value)


def test_person_names_accept_accents_and_compound_names():
    assert validate_person_name("  María   José ") == "María José"
    assert validate_person_name("O'Brien Núñez") == "O'Brien Núñez"


@pytest.mark.parametrize("value", ["Ana2", "1234", "Ana_Perez", "   "])
def test_person_names_reject_numbers_and_symbols(value):
    with pytest.raises(ValueError):
        validate_person_name(value)


def test_place_names_only_accept_letters():
    assert validate_place_name("Santo Domingo") == "Santo Domingo"
    with pytest.raises(ValueError):
        validate_place_name("Quito 2")


@pytest.mark.parametrize("value", ["ana@gmail.com", "ana.perez@uta.edu.ec"])
def test_emails_with_domain(value):
    assert validate_email_domain(value) == value


@pytest.mark.parametrize("value", ["ana@gmail", "ana@localhost", "ana@gmail.c", "anagmail.com"])
def test_emails_without_domain(value):
    with pytest.raises(ValueError):
        validate_email_domain(value)


def test_plates_are_normalized_to_the_ecuadorian_format():
    assert validate_plate("pba1234") == "PBA-1234"
    assert validate_plate("ABC-123") == "ABC-123"
    with pytest.raises(ValueError):
        validate_plate("AB-12345")


def test_digits_only_fields():
    assert validate_digits("025") == "025"
    with pytest.raises(ValueError):
        validate_digits("25A")
