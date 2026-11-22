import type { BusTripHistory, TripProblem, TripReport } from '../types/reports.types';

const COOPERATIVE_API = '/api/v1/cooperatives/me';

async function request<T>(url: string, fallback: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Inténtalo nuevamente.');
  }

  if (!response.ok) {
    let message = fallback;
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'detail' in payload &&
        typeof payload.detail === 'string'
      ) {
        message = payload.detail;
      }
    } catch {
      // Conserva el mensaje genérico si el servidor no devuelve JSON.
    }
    throw new Error(
      response.status === 401 ? 'Tu sesión expiró. Inicia sesión nuevamente.' : message,
    );
  }

  return (await response.json()) as T;
}

export function getCooperativeTripReport(tripId: number): Promise<TripReport> {
  return request(`${COOPERATIVE_API}/trips/${tripId}/report`, 'No fue posible cargar el reporte.');
}

export function cooperativeTripReportPdfUrl(tripId: number): string {
  return `${COOPERATIVE_API}/trips/${tripId}/report/pdf`;
}

export function getCooperativeBusHistory(busId: number): Promise<BusTripHistory> {
  return request(
    `${COOPERATIVE_API}/buses/${busId}/history`,
    'No fue posible cargar el historial del bus.',
  );
}

export function getTripProblems(onlyOpen: boolean): Promise<TripProblem[]> {
  return request(
    `${COOPERATIVE_API}/trip-problems?onlyOpen=${onlyOpen}`,
    'No fue posible cargar los problemas reportados.',
  );
}

export function resolveTripProblem(problemId: number): Promise<TripProblem> {
  return request(
    `${COOPERATIVE_API}/trip-problems/${problemId}/resolve`,
    'No fue posible marcar el problema como atendido.',
    { method: 'POST' },
  );
}
