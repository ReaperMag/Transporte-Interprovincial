export type TripStatus = 'scheduled' | 'boarding' | 'in_progress' | 'finished' | 'cancelled';
export type PassengerCategory = 'regular' | 'minor' | 'senior' | 'disability';
export type ProblemType = 'delay' | 'mechanical' | 'other';

export interface TripProblem {
  id: number;
  tripId: number;
  problemType: ProblemType | null;
  comment: string;
  reportedByName: string | null;
  reportedAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
}

export interface TripReportOnboardSale {
  seatNumber: number;
  passengerName: string;
  passengerCategory: PassengerCategory;
  originCityName: string;
  destinationCityName: string;
  boardingDescription: string | null;
  destinationDescription: string | null;
  price: string;
  soldByName: string | null;
  soldAt: string;
}

export interface TripReport {
  tripId: number;
  status: TripStatus;
  originCityName: string;
  destinationCityName: string;
  busNumber: string;
  busPlate: string;
  scheduledDepartureAt: string;
  boardingStartedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMinutes: number | null;
  boardingStartedByName: string | null;
  startedByName: string | null;
  finishedByName: string | null;
  passengers: {
    ticketsSold: number;
    boarded: number;
    noShow: number;
    rejected: number;
    onboardSales: number;
  };
  totals: { online: string; office: string; onBoard: string; total: string };
  onboardSales: TripReportOnboardSale[];
  problems: TripProblem[];
}

export interface BusTripHistoryItem {
  tripId: number;
  status: TripStatus;
  originCityName: string;
  destinationCityName: string;
  scheduledDepartureAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMinutes: number | null;
  passengersBoarded: number;
  onboardSales: number;
  total: string;
  openProblems: number;
}

export interface BusTripHistory {
  busId: number;
  busNumber: string;
  busPlate: string;
  trips: BusTripHistoryItem[];
}
