export type PassengerCategory = 'regular' | 'minor' | 'senior' | 'disability';

export interface ReservationPassengerInput {
  idNumber: string;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  category: PassengerCategory;
}

export interface ReservationSeatInput {
  seatId: number;
  passenger: ReservationPassengerInput;
}

export interface ReservationCreate {
  tripId: number;
  originCityId: number;
  destinationCityId: number;
  seats: ReservationSeatInput[];
}

export interface ReservationSeatRead {
  seatId: number;
  seatNumber: number;
  seatType: string;
  passengerId: number;
  passengerIdNumber: string;
  passengerName: string;
  passengerCategory: PassengerCategory;
  basePrice: string | number;
  discountAmount: string | number;
  price: string | number;
}

export interface ReservationRead {
  id: number;
  tripId: number;
  status: string;
  originCityId: number;
  destinationCityId: number;
  departureAt: string;
  expiresAt: string | null;
  total: string | number;
  seats: ReservationSeatRead[];
}

export class ReservationRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ReservationRequestError';
  }
}

// Crear una reserva del pasajero.
export async function createPassengerReservation(
  payload: ReservationCreate,
): Promise<ReservationRead> {
  const response = await fetch('/api/v1/reservations', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);

    let message = 'No se pudo crear la reserva. Inténtalo nuevamente.';

    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      message = body.detail;
    }

    if (response.status === 401) {
      message = 'Tu sesión ha expirado. Inicia sesión nuevamente.';
    } else if (response.status === 403) {
      message = 'No se pudo autorizar la reserva. Comprueba tu sesión.';
    } else if (response.status === 409) {
      message = 'Uno o más asientos dejaron de estar disponibles. Actualizaremos la selección.';
    } else if (response.status === 422) {
      message = 'Los datos de la reserva no son válidos. Revisa el formulario.';
    }

    throw new ReservationRequestError(message, response.status);
  }

  return (await response.json()) as ReservationRead;
}

// Consultar las reservas del pasajero autenticado.
export async function getPassengerReservations(): Promise<ReservationRead[]> {
  const response = await fetch('/api/v1/reservations/me', {
    credentials: 'include',
  });

  if (!response.ok) {
    let message = 'No se pudieron consultar tus reservas.';

    if (response.status === 401) {
      message = 'Tu sesión ha expirado. Inicia sesión nuevamente.';
    } else if (response.status === 403) {
      message = 'No tienes autorización para consultar estas reservas.';
    } else {
      const body: unknown = await response.json().catch(() => null);

      if (
        typeof body === 'object' &&
        body !== null &&
        'detail' in body &&
        typeof body.detail === 'string'
      ) {
        message = body.detail;
      }
    }

    throw new ReservationRequestError(message, response.status);
  }

  return (await response.json()) as ReservationRead[];
}

// Cancelar una reserva del pasajero.
export async function cancelPassengerReservation(reservationId: number): Promise<ReservationRead> {
  const response = await fetch(`/api/v1/reservations/${reservationId}/cancel`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);

    let message = 'No se pudo cancelar la reserva. Inténtalo nuevamente.';

    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      message = body.detail;
    }

    if (response.status === 401) {
      message = 'Tu sesión ha expirado. Inicia sesión nuevamente.';
    } else if (response.status === 403) {
      message = 'No tienes autorización para cancelar esta reserva.';
    }

    throw new ReservationRequestError(message, response.status);
  }

  return (await response.json()) as ReservationRead;
}
