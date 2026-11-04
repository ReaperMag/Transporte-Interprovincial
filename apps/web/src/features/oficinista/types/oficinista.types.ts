export interface OficinistaInfo {
  accountId: number;
  firstName: string;
  lastName: string;
  fullName: string;
  cooperativeId?: number | null;
}

export interface UpcomingTrip {
  tripId: number;
  routeOrigin: string;
  routeDestination: string;
  departureAt: string; // ISO datetime
  departureTime: string; // formatted time
  busPlate?: string | null;
  frequencyResolutionNumber?: string | null;
}
