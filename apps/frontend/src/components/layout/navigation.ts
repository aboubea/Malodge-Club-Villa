import {
  Briefcase,
  Building2,
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Settings,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { AI_CONCIERGE_ENABLED } from '../../lib/features';

/**
 * The whole navigation in one place: a few sections in the side menu, and the pages of
 * each section as tabs at the top of the page. Each role only sees what concerns it.
 */
export type RoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'PROVIDER' | 'CLIENT' | 'OWNER' | 'EMPLOYEE';

export interface NavPage {
  path: string;
  label: string;
  exact?: boolean;
  roles?: RoleKey[];
  /** Shown greyed out with this reason, not clickable. */
  disabled?: string;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: React.ElementType;
  pages: NavPage[];
}

const STAFF: RoleKey[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
const ADMIN_UP: RoleKey[] = ['SUPER_ADMIN', 'ADMIN'];
const APP_USERS: RoleKey[] = [...STAFF, 'PROVIDER', 'CLIENT'];

export const NAV_GROUPS: NavGroup[] = [
  { key: 'home', label: 'Accueil', icon: LayoutDashboard, pages: [{ path: '/', label: 'Tableau de bord', exact: true, roles: STAFF }] },
  {
    key: 'stays',
    label: 'Séjours',
    icon: CalendarDays,
    pages: [
      { path: '/reservations', label: 'Réservations', roles: STAFF },
      { path: '/agenda', label: 'Agenda', roles: STAFF },
      { path: '/accueil', label: 'Accueil voyageurs', roles: STAFF },
    ],
  },
  {
    key: 'villas',
    label: 'Villas',
    icon: Building2,
    pages: [
      { path: '/villas', label: 'Villas', roles: STAFF },
      { path: '/services', label: 'Catalogue', roles: STAFF },
      { path: '/documents', label: 'Documents', roles: STAFF },
    ],
  },
  {
    key: 'extras',
    label: 'Extras',
    icon: Wallet,
    pages: [
      { path: '/extras', label: 'Suivi des extras', roles: STAFF },
      { path: '/commandes', label: 'Commandes', roles: STAFF },
      { path: '/prestataires', label: 'Prestataires', roles: STAFF },
    ],
  },
  {
    key: 'finances',
    label: 'Finances',
    icon: TrendingUp,
    pages: [
      { path: '/finances', label: 'Finances', roles: STAFF },
      { path: '/performance', label: 'Performance', roles: STAFF },
      { path: '/releves', label: 'Relevés propriétaires', roles: ADMIN_UP },
    ],
  },
  // Clients
  {
    key: 'my-stay',
    label: 'Mon séjour',
    icon: Building2,
    pages: [
      { path: '/mes-sejours', label: 'Mon séjour', roles: ['CLIENT'] },
      { path: '/catalogue', label: 'Services', roles: ['CLIENT'] },
      { path: '/commandes', label: 'Mes demandes', roles: ['CLIENT'] },
      { path: '/mon-compte', label: 'Mon compte', roles: ['CLIENT'] },
    ],
  },
  // Providers (their space opens full screen, made for the phone)
  { key: 'missions', label: 'Mes missions', icon: Briefcase, pages: [{ path: '/prestataire', label: 'Mes missions', roles: ['PROVIDER'] }] },
  { key: 'account', label: 'Mon compte', icon: Wallet, pages: [{ path: '/mon-compte', label: 'Mon compte', roles: ['PROVIDER', 'OWNER', 'EMPLOYEE'] }] },
  {
    key: 'messages',
    label: 'Messages',
    icon: MessageSquare,
    pages: [
      { path: '/messages', label: 'Messages', roles: APP_USERS },
      { path: '/notifications', label: 'Notifications' },
      { path: '/concierge-ia', label: 'Concierge IA', roles: APP_USERS, disabled: AI_CONCIERGE_ENABLED ? undefined : 'Bientôt disponible' },
    ],
  },
  {
    key: 'settings',
    label: 'Réglages',
    icon: Settings,
    pages: [
      { path: '/parametres', label: 'Paramètres', roles: STAFF },
      { path: '/utilisateurs', label: 'Utilisateurs', roles: ADMIN_UP },
      { path: '/controle', label: 'Contrôle des données', roles: ADMIN_UP },
      { path: '/nettoyage', label: 'Nettoyage des données', roles: ADMIN_UP },
    ],
  },
];

const canSee = (p: NavPage, role?: string) => !p.roles || (!!role && (p.roles as string[]).includes(role));

/** The sections this role sees, each with its pages for this role. */
export function groupsFor(role?: string): (NavGroup & { home: NavPage })[] {
  return NAV_GROUPS.map((g) => ({ ...g, pages: g.pages.filter((p) => canSee(p, role)) }))
    .filter((g) => g.pages.some((p) => !p.disabled))
    .map((g) => ({ ...g, home: g.pages.find((p) => !p.disabled)! }));
}

export const pageMatches = (p: NavPage, pathname: string) => (p.exact ? pathname === p.path : pathname === p.path || pathname.startsWith(`${p.path}/`));

/** The section of the current page (a detail page such as /villas/123 belongs to Villas). */
export function groupOf(pathname: string, role?: string) {
  return groupsFor(role).find((g) => g.pages.some((p) => pageMatches(p, pathname)));
}
