export interface InvoiceItem {
  passengerName: string;
  seatNumber: string;
  price: number;
}

export interface InvoiceData {
  number: string;
  issuedAt: string;
  currency: string;
  items: InvoiceItem[];
}
