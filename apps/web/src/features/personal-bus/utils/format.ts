import type { PassengerCategory, TicketStatus, TripStatus } from '../types/personalBus.types';

export function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(
    Number(value),
  );
}

export function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '-';
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  scheduled: 'Programado',
  boarding: 'En abordaje',
  in_progress: 'En curso',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  issued: 'Por abordar',
  used: 'Abordó',
  rejected: 'Rechazado',
  no_show: 'No se presentó',
  cancelled: 'Cancelado',
};

export const CATEGORY_LABELS: Record<PassengerCategory, string> = {
  regular: 'Normal',
  minor: 'Menor de edad',
  senior: 'Tercera edad',
  disability: 'Discapacidad',
};
