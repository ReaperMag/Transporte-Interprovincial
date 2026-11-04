import type { KeyboardEvent } from 'react';

/**
 * Validaciones compartidas por los formularios de todos los paneles.
 *
 * Las funciones `only...` y `clean...` quitan lo que no corresponde mientras se
 * escribe, por ejemplo las letras en una cédula. Las funciones `...Error`
 * devuelven el mensaje que se muestra si el valor no es válido, o `null` si
 * está bien.
 * Las mismas reglas se revisan otra vez en el backend.
 */

const VALID_PROVINCES = new Set([...Array.from({ length: 24 }, (_, index) => index + 1), 30]);
const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;
const EMAIL_PATTERN =
  /^[^@\s]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PHONE_PATTERN = /^\+?\d{7,15}$/;
const PLATE_PATTERN = /^[A-Z]{3}-\d{3,4}$/;

/** Deja solo números, hasta el largo indicado. */
export function onlyDigits(value: string, maxLength?: number): string {
  const digits = value.replace(/\D/g, '');
  return maxLength === undefined ? digits : digits.slice(0, maxLength);
}

/** Deja números, espacios, guiones y un + al inicio. */
export function cleanPhone(value: string): string {
  const cleaned = value.replace(/[^\d +-]/g, '');
  return cleaned.replace(/(?!^)\+/g, '');
}

/** Deja letras, espacios, apóstrofos y guiones. */
export function cleanName(value: string): string {
  return value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ '-]/g, '');
}

/** Placa en mayúsculas, solo letras, números y guion. */
export function cleanPlate(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 8);
}

export function isValidCedula(value: string): boolean {
  if (!/^\d{10}$/.test(value)) {
    return false;
  }

  const province = Number(value.slice(0, 2));
  const thirdDigit = Number(value[2]);
  if (!VALID_PROVINCES.has(province) || thirdDigit > 5) {
    return false;
  }

  let total = 0;
  for (let index = 0; index < 9; index += 1) {
    let digit = Number(value[index]);
    if (index % 2 === 0) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    total += digit;
  }

  return (10 - (total % 10)) % 10 === Number(value[9]);
}

export function cedulaError(value: string): string | null {
  if (!value) {
    return 'Ingresa la cédula.';
  }
  if (!/^\d{10}$/.test(value)) {
    return 'La cédula debe tener exactamente 10 números.';
  }
  return isValidCedula(value) ? null : 'La cédula ecuatoriana no es válida.';
}

export function rucError(value: string): string | null {
  if (!/^\d{13}$/.test(value)) {
    return 'El RUC debe tener exactamente 13 números.';
  }

  const province = Number(value.slice(0, 2));
  const thirdDigit = Number(value[2]);
  const validType = thirdDigit <= 6 || thirdDigit === 9;
  if (!VALID_PROVINCES.has(province) || !validType || value.endsWith('000')) {
    return 'El RUC ecuatoriano no es válido.';
  }
  if (thirdDigit <= 5 && !isValidCedula(value.slice(0, 10))) {
    return 'El RUC ecuatoriano no es válido.';
  }
  return null;
}

/** Teléfono opcional: vacío es válido. */
export function phoneError(value: string, required = false): string | null {
  const compact = value.replace(/[ -]/g, '');
  if (!compact) {
    return required ? 'Ingresa el teléfono.' : null;
  }
  return PHONE_PATTERN.test(compact)
    ? null
    : 'El teléfono solo puede tener números, de 7 a 15 dígitos.';
}

export function nameError(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return 'Este campo es obligatorio.';
  }
  return NAME_PATTERN.test(normalized) ? null : 'Solo se permiten letras.';
}

/** Correo opcional: vacío es válido salvo que sea obligatorio. */
export function emailError(value: string, required = true): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return required ? 'Ingresa el correo electrónico.' : null;
  }
  return EMAIL_PATTERN.test(trimmed)
    ? null
    : 'Ingresa un correo con dominio, por ejemplo usuario@gmail.com.';
}

export function plateError(value: string): string | null {
  let normalized = value.toUpperCase().replace(/\s/g, '');
  if (/^[A-Z]{3}\d{3,4}$/.test(normalized)) {
    normalized = `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  }
  return PLATE_PATTERN.test(normalized)
    ? null
    : 'La placa debe tener tres letras y tres o cuatro números, por ejemplo PBA-1234.';
}

export function digitsError(value: string): string | null {
  return /^\d+$/.test(value.trim()) ? null : 'Este campo solo puede tener números.';
}

/**
 * Marca el campo como inválido para que el navegador muestre el mensaje y
 * no deje enviar el formulario hasta corregirlo.
 */
export function setFieldValidity(
  input: HTMLInputElement | HTMLTextAreaElement,
  message: string | null,
): void {
  input.setCustomValidity(message ?? '');
}

const NON_NUMERIC_KEYS = new Set(['e', 'E', '+', '-', '.', ',']);

/**
 * Los campos `type="number"` del navegador dejan escribir la letra e y
 * signos. Este manejador los bloquea para que solo entren números.
 */
export function preventNonNumericKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (NON_NUMERIC_KEYS.has(event.key)) {
    event.preventDefault();
  }
}
