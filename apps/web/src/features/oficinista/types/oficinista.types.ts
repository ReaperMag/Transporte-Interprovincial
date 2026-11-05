export interface OficinistaInfo {
  accountId: number;
  firstName: string;
  lastName: string;
  fullName: string;
  idNumber: string;
  email: string;
  phone: string | null;
  position: string;
  cooperativeId: number;
  cooperativeName: string;
  cooperativeLogoUrl: string | null;
  cooperativeRuc: string;
  cooperativeAddress: string | null;
  cooperativePhone: string | null;
  cooperativeEmail: string | null;
  cooperativeSupportPhone: string | null;
  cooperativeSupportEmail: string | null;
}
