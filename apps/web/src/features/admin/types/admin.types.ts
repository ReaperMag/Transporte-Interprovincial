export interface Cooperative {
  id: number;
  name: string;
  ruc: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  isActive: boolean;
}

export interface CooperativeWrite {
  name: string;
  ruc: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  isActive: boolean;
}

export interface CooperativeAccountCreate extends CooperativeWrite {
  accountEmail: string;
  initialPassword: string;
}

export interface AdminSummary {
  cooperatives: number;
}
