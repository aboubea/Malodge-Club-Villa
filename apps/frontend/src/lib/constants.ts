export const APP_NAME = 'Malodge Club Villa';
export const APP_TAGLINE = 'Excellence en Conciergerie de Luxe';

export const ROLES_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrateur',
  MANAGER: 'Manager',
  PROVIDER: 'Prestataire',
  CLIENT: 'Client',
  OWNER: 'Propriétaire',
  EMPLOYEE: 'Salarié',
};

export const ROLES_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-danger/10 text-danger border-danger/25',
  ADMIN: 'bg-info/10 text-info border-info/25',
  MANAGER: 'bg-plum/10 text-plum border-plum/25',
  PROVIDER: 'bg-copper/10 text-copper border-copper/25',
  CLIENT: 'bg-success/10 text-success border-success/25',
  OWNER: 'bg-gold/15 text-accent border-gold/30',
  EMPLOYEE: 'bg-info/10 text-info border-info/25',
};

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  ACTIVE: 'Active',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
};

export const RESERVATION_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-warning/10 text-warning border-warning/25',
  CONFIRMED: 'bg-info/10 text-info border-info/25',
  ACTIVE: 'bg-success/10 text-success border-success/25',
  COMPLETED: 'bg-line text-muted border-line',
  CANCELLED: 'bg-danger/10 text-danger border-danger/25',
};

export const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { path: '/villas', label: 'Villas', icon: 'Building2' },
  { path: '/reservations', label: 'Réservations', icon: 'CalendarDays' },
  { path: '/services', label: 'Services', icon: 'Sparkles' },
  { path: '/clients', label: 'Clients', icon: 'Users' },
  { path: '/prestataires', label: 'Prestataires', icon: 'Briefcase' },
  { path: '/finances', label: 'Finances', icon: 'TrendingUp' },
  { path: '/documents', label: 'Documents', icon: 'FolderOpen' },
  { path: '/utilisateurs', label: 'Utilisateurs', icon: 'UserCog' },
  { path: '/parametres', label: 'Paramètres', icon: 'Settings' },
];
