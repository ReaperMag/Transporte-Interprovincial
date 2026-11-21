import type {
  BusTripHistory,
  OnboardSale,
  OnboardSaleCreate,
  OnboardSaleOptions,
  OnboardSalesSummary,
  PersonalBusProfile,
  ProblemType,
  TicketValidationResult,
  TripDetail,
  TripPassenger,
  TripProblem,
  TripReport,
  TripSummary,
} from '../types/personalBus.types';

const API = '/api/v1/bus-staff';

async function readError(response: Response, fallback: string): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const { detail } = body as { detail: unknown };
    if (typeof detail === 'string') return new Error(detail);
    if (Array.isArray(detail)) return new Error('Revisa los datos ingresados.');
  }
  if (response.status === 401) return new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
  if (response.status === 403) return new Error('No tienes autorización para esta operación.');
  return new Error(fallback);
}

async function request<T>(url: string, fallback: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new Error(
      'No hay conexión con el servidor. Revisa los datos móviles e inténtalo de nuevo.',
    );
  }
  if (!response.ok) throw await readError(response, fallback);
  return (await response.json()) as T;
}

function post<T>(url: string, fallback: string, body?: unknown): Promise<T> {
  return request<T>(url, fallback, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function getPersonalBusProfile(): Promise<PersonalBusProfile> {
  return request(`${API}/me`, 'No fue posible cargar tu perfil.');
}

export function listMyTrips(): Promise<TripSummary[]> {
  return request(`${API}/trips`, 'No fue posible cargar los viajes.');
}

export function getMyTrip(tripId: number): Promise<TripDetail> {
  return request(`${API}/trips/${tripId}`, 'No fue posible cargar el viaje.');
}

export function startBoarding(tripId: number): Promise<TripDetail> {
  return post(`${API}/trips/${tripId}/boarding`, 'No fue posible iniciar el abordaje.');
}

export function validateTicket(tripId: number, code: string): Promise<TicketValidationResult> {
  return post(`${API}/trips/${tripId}/tickets/validate`, 'No fue posible validar el boleto.', {
    code,
  });
}

export function confirmCategory(tripId: number, ticketId: number): Promise<TripPassenger> {
  return post(
    `${API}/trips/${tripId}/tickets/${ticketId}/confirm-category`,
    'No fue posible confirmar la categoría.',
  );
}

export function rejectCategory(tripId: number, ticketId: number): Promise<TripPassenger> {
  return post(
    `${API}/trips/${tripId}/tickets/${ticketId}/reject-category`,
    'No fue posible rechazar el boleto.',
  );
}

export function startTrip(tripId: number): Promise<TripDetail> {
  return post(`${API}/trips/${tripId}/start`, 'No fue posible iniciar el viaje.');
}

export function finishTrip(tripId: number): Promise<TripDetail> {
  return post(`${API}/trips/${tripId}/finish`, 'No fue posible finalizar el viaje.');
}

export function reportProblem(
  tripId: number,
  comment: string,
  problemType: ProblemType | null,
): Promise<TripProblem> {
  return post(`${API}/trips/${tripId}/problems`, 'No fue posible reportar el problema.', {
    comment,
    problemType,
  });
}

export function getOnboardSaleOptions(
  tripId: number,
  originCityId?: number,
  destinationCityId?: number,
): Promise<OnboardSaleOptions> {
  const params = new URLSearchParams();
  if (originCityId) params.set('originCityId', String(originCityId));
  if (destinationCityId) params.set('destinationCityId', String(destinationCityId));
  const query = params.toString();
  return request(
    `${API}/trips/${tripId}/onboard-sales/options${query ? `?${query}` : ''}`,
    'No fue posible cargar los asientos libres.',
  );
}

export function createOnboardSale(tripId: number, sale: OnboardSaleCreate): Promise<OnboardSale> {
  return post(`${API}/trips/${tripId}/onboard-sales`, 'No fue posible registrar la venta.', sale);
}

export function listOnboardSales(tripId: number): Promise<OnboardSalesSummary> {
  return request(`${API}/trips/${tripId}/onboard-sales`, 'No fue posible cargar las ventas.');
}

export function getMyTripReport(tripId: number): Promise<TripReport> {
  return request(`${API}/trips/${tripId}/report`, 'No fue posible cargar el reporte.');
}

export function myTripReportPdfUrl(tripId: number): string {
  return `${API}/trips/${tripId}/report/pdf`;
}

export function getMyBusHistory(): Promise<BusTripHistory> {
  return request(`${API}/history`, 'No fue posible cargar el historial.');
}
