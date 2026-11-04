import type { OficinistaInfo, UpcomingTrip } from '../types/oficinista.types';

export async function getOficinistaInfo(): Promise<OficinistaInfo | null> {
  const response = await fetch('/api/v1/staff/me', {
    credentials: 'same-origin',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('No fue posible obtener la información del oficinista.');
  }

  return (await response.json()) as OficinistaInfo;
}

export async function getUpcomingTrips(): Promise<UpcomingTrip[]> {
  const response = await fetch('/api/v1/trips/upcoming-for-sale', {
    credentials: 'same-origin',
  });

  if (response.status === 401 || response.status === 403) {
    return [];
  }

  if (!response.ok) {
    throw new Error('No fue posible obtener los viajes próximos.');
  }

  const data = (await response.json()) as UpcomingTrip[];
  return data.map((trip) => ({
    ...trip,
    departureTime: formatDepartureTime(trip.departureAt),
  }));
}

function formatDepartureTime(departureAt: string): string {
  try {
    const date = new Date(departureAt);
    return date.toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return departureAt;
  }
}
