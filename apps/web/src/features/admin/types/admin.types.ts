export interface CooperativeLogo {
  initials: string;
  from: string;
  to: string;
}

export interface Cooperative {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  logo: CooperativeLogo;
}

export interface AdminSummaryMetric {
  id: string;
  label: string;
  value: string;
}

export interface AdminNavItem {
  to: string;
  label: string;
}

export interface AdminSectionContent {
  title: string;
  description: string;
}
