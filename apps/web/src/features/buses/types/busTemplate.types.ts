export type SeatType = 'normal' | 'vip';

export interface TemplateSeat {
  id: string;
  number: number;
  floor: number;
  row: number;
  column: number;
  seatType: SeatType;
}

export interface BusTemplate {
  id: string;
  name: string;
  floors: number;
  hasBathroom: boolean;
  rows: number;
  columns: number;
  seats: TemplateSeat[];
}
