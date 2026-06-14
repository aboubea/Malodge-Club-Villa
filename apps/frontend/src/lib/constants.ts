export const APP_NAME = 'Mahodge Club Villa';
export const APP_TAGLINE = 'Excellence en Conciergerie de Luxe';

export const ROLES_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrateur',
  MANAGER: 'Manager',
  PROVIDER: 'Prestataire',
  CLIENT: 'Client',
};

export const ROLES_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-900/30 text-red-400 border-red-800/50',
  ADMIN: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
  MANAGER: 'bg-purple-900/30 text-purple-400 border-purple-800/50',
  PROVIDER: 'bg-orange-900/30 text-orange-400 border-orange-800/50',
  CLIENT: 'bg-green-900/30 text-green-400 border-green-800/50',
};

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  ACTIVE: 'Active',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
};

export const RESERVATION_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50',
  CONFIRMED: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
  ACTIVE: 'bg-green-900/30 text-green-400 border-green-800/50',
  COMPLETED: 'bg-[#242428] text-[#6B6B6F] border-[#242428]',
  CANCELLED: 'bg-red-900/30 text-red-400 border-red-800/50',
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
