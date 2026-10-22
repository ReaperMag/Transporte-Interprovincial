import type { AdminNavItem } from '../types/admin.types';

export const adminSession = {
  displayName: 'Admin',
  email: 'admin@transporte.ec',
};

export const adminNavItems: AdminNavItem[] = [
  { to: '/admin/cooperativas', label: 'Cooperativas' },
  { to: '/admin/oficinistas', label: 'Oficinistas' },
  { to: '/admin/usuarios-bus', label: 'Usuarios Bus' },
  { to: '/admin/ventas', label: 'Ventas' },
  { to: '/admin/reportes', label: 'Reportes' },
];

export const globalSettingsItems = [
  'Parámetros del sistema',
  'Ciudades y terminales',
  'Métodos de pago',
  'Categorías de descuento',
];
