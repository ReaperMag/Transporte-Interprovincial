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

export interface AdminSummaryMetric {
  id: string;
  label: string;
  value: number;
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

export interface AdminSummary {
  cooperatives: number;
  routes: number;
  buses: number;
}

export interface AdminNavItem {
  to: string;
  label: string;
}

export interface AdminSectionContent {
  title: string;
  description: string;
}
