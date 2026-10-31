export interface Cooperative {
  id: number;
  name: string;
  ruc: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
}

export interface CooperativeWrite {
  name: string;
  ruc: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface CooperativeAccountCreate extends Omit<CooperativeWrite, 'email'> {
  accountEmail: string;
  initialPassword: string;
}

export interface AdminSummary {
  cooperatives: number;
}
