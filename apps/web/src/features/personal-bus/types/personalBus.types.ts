export type TripStatus = 'scheduled' | 'boarding' | 'in_progress' | 'finished' | 'cancelled';
export type TicketStatus = 'issued' | 'used' | 'rejected' | 'no_show' | 'cancelled';
export type PassengerCategory = 'regular' | 'minor' | 'senior' | 'disability';
export type SaleChannel = 'online' | 'office' | 'on_board';
export type ProblemType = 'delay' | 'mechanical' | 'other';

export interface AssignedBus {
  id: number;
  number: string;
  plate: string;
}

export interface PersonalBusProfile {
  firstName: string;
  lastName: string;
  idNumber: string;
  email: string;
  phone: string | null;
  cooperativeId: number;
  cooperativeName: string;
  cooperativeLogoUrl: string | null;
  cooperativePrimaryColor: string | null;
  cooperativeSecondaryColor: string | null;
  assignedBus: AssignedBus | null;
}

export interface TripSummary {
  id: number;
  status: TripStatus;
  departureAt: string;
  originCityName: string;
  destinationCityName: string;
  busNumber: string;
  ticketsSold: number;
  passengersBoarded: number;
}

export interface TripPassenger {
  ticketId: number;
  seatNumber: number;
  passengerName: string;
  passengerIdNumber: string;
  passengerCategory: PassengerCategory;
  originCityName: string;
  destinationCityName: string;
  channel: SaleChannel;
  price: string;
  status: TicketStatus;
  validatedAt: string | null;
  rejectionReason: string | null;
}

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

export interface TripDetail extends TripSummary {
  boardingStartedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  passengers: TripPassenger[];
  problems: TripProblem[];
}

export interface TicketValidationResult {
  result: 'boarded' | 'needs_category_check';
  message: string;
  passenger: TripPassenger;
}

export interface OnboardStop {
  cityId: number;
  cityName: string;
}

export interface OnboardSeat {
  seatId: number;
  seatNumber: number;
  seatType: string;
  isFree: boolean;
  suggestedPrice: string | null;
}

export interface OnboardSaleOptions {
  stops: OnboardStop[];
  originCityId: number;
  destinationCityId: number;
  seats: OnboardSeat[];
}

export interface OnboardSaleCreate {
  seatId: number;
  passenger: {
    idNumber: string;
    firstName: string;
    lastName: string;
    category: PassengerCategory;
  };
  originCityId: number;
  destinationCityId: number;
  boardingDescription: string;
  destinationDescription: string;
  price?: string;
}

export interface OnboardSale {
  ticketId: number;
  code: string;
  seatNumber: number;
  passengerName: string;
  passengerIdNumber: string;
  passengerCategory: PassengerCategory;
  originCityName: string;
  destinationCityName: string;
  boardingDescription: string | null;
  destinationDescription: string | null;
  price: string;
  soldByName: string | null;
  soldAt: string;
}

export interface OnboardSalesSummary {
  sales: OnboardSale[];
  total: string;
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
  onboardSales: Omit<OnboardSale, 'ticketId' | 'code' | 'passengerIdNumber'>[];
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
