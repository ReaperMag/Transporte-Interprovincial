import type { AdminNavItem, AdminSummaryMetric, Cooperative } from '../types/admin.types';

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

export const mockCooperatives: Cooperative[] = [
  {
    id: 'coop-loja-internacional',
    name: 'Cooperativa Loja Internacional',
    email: 'contacto@lojainternacional.ec',
    phone: '1232-3375378',
    isActive: true,
    logo: { initials: 'LI', from: '#1d4ed8', to: '#38bdf8' },
  },
  {
    id: 'coop-carlos-alberto-aray',
    name: 'Cooperativa Carlos Alberto Aray',
    email: 'contacto@carlosalbertoaray.ec',
    phone: '1232-3574904',
    isActive: true,
    logo: { initials: 'CA', from: '#0f766e', to: '#5eead4' },
  },
  {
    id: 'coop-banos',
    name: 'Cooperativa Baños',
    email: 'contacto@coopbanos.ec',
    phone: '1232-5579022',
    isActive: false,
    logo: { initials: 'CB', from: '#15803d', to: '#86efac' },
  },
  {
    id: 'coop-rizos',
    name: 'Cooperativa Rizos',
    email: 'contacto@rizos.ec',
    phone: '1232-5576871',
    isActive: false,
    logo: { initials: 'CR', from: '#a16207', to: '#fde047' },
  },
  {
    id: 'coop-esmeraldas',
    name: 'Cooperativa Esmeraldas',
    email: 'contacto@esmeraldas.ec',
    phone: '1232-5577890',
    isActive: true,
    logo: { initials: 'CE', from: '#047857', to: '#6ee7b7' },
  },
  {
    id: 'coop-loja-alberto',
    name: 'Cooperativa Loja Alberto',
    email: 'contacto@lojaalberto.ec',
    phone: '1232-3579306',
    isActive: true,
    logo: { initials: 'LA', from: '#1e3a8a', to: '#93c5fd' },
  },
  {
    id: 'coop-pandeuo',
    name: 'Cooperativa Pandeuo',
    email: 'contacto@pandeuo.ec',
    phone: '1232-5579589',
    isActive: false,
    logo: { initials: 'CP', from: '#9f1239', to: '#fda4af' },
  },
];

export const mockAdminSummary: AdminSummaryMetric[] = [
  { id: 'cooperatives', label: 'Cooperativas Registradas:', value: '25' },
  { id: 'routes', label: 'Rutas Totales:', value: '150' },
  { id: 'buses', label: 'Buses en Servicio:', value: '300' },
];
