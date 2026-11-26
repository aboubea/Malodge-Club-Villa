import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Sparkles,
  Briefcase,
  TrendingUp,
  FolderOpen,
  UserCog,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  MessageSquare,
  BrainCircuit,
  Bell,
  Store,
  CalendarRange,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../../lib/utils';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';
import { Logo, LogoMark } from '../brand/Logo';
import { apiClient } from '../../lib/apiClient';
import { ROLES_LABELS } from '../../lib/constants';

type RoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'PROVIDER' | 'CLIENT';

interface NavDef {
  path: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  roles?: RoleKey[]; // undefined = visible to all authenticated users
}

interface NavSection {
  title: string;
  items: NavDef[];
}

const STAFF: RoleKey[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
const ADMIN_UP: RoleKey[] = ['SUPER_ADMIN', 'ADMIN'];
const CLIENT: RoleKey[] = ['CLIENT'];

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Pilotage',
    items: [
      { path: '/', label: 'Tableau de bord', icon: LayoutDashboard, exact: true, roles: STAFF },
      { path: '/agenda', label: 'Agenda', icon: CalendarRange, roles: STAFF },
      { path: '/finances', label: 'Finances', icon: TrendingUp, roles: STAFF },
    ],
  },
  {
    title: 'Mon séjour',
    items: [
      { path: '/mes-sejours', label: 'Mes séjours', icon: Building2, roles: CLIENT },
      { path: '/catalogue', label: 'Services', icon: Store, roles: CLIENT },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { path: '/villas', label: 'Villas', icon: Building2, roles: STAFF },
      { path: '/reservations', label: 'Réservations', icon: CalendarDays, roles: STAFF },
      { path: '/services', label: 'Catalogue', icon: Sparkles, roles: STAFF },
      { path: '/prestataires', label: 'Prestataires', icon: Briefcase, roles: STAFF },
      { path: '/documents', label: 'Documents', icon: FolderOpen, roles: STAFF },
    ],
  },
  {
    title: 'Conciergerie',
    items: [
      { path: '/commandes', label: 'Commandes', icon: ShoppingBag },
      { path: '/messages', label: 'Messages', icon: MessageSquare },
      { path: '/concierge-ia', label: 'Concierge IA', icon: BrainCircuit },
      { path: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
];

const BOTTOM_NAV: NavDef[] = [
  { path: '/utilisateurs', label: 'Utilisateurs', icon: UserCog, roles: ADMIN_UP },
  { path: '/parametres', label: 'Paramètres', icon: Settings, roles: STAFF },
];

interface NavItemProps {
  item: NavDef;
  collapsed: boolean;
  badge?: number;
  onNavigate?: () => void;
}

function NavItem({ item, collapsed, badge, onNavigate }: NavItemProps) {
  const location = useLocation();
  const { path, label, icon: Icon, exact } = item;
  const isActive = exact ? location.pathname === path : location.pathname.startsWith(path);
  const hasBadge = badge != null && badge > 0;

  return (
    <NavLink
      to={path}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 h-9 px-3 rounded-lg text-[13.5px] transition-colors duration-150',
        isActive
          ? 'bg-surface-2 text-ink font-medium'
          : 'text-ink-soft hover:text-ink hover:bg-surface-2/60',
        collapsed && 'justify-center px-0 w-10 mx-auto',
      )}
    >
      {isActive && (
        <motion.span
          layoutId="nav-active-indicator"
          className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-accent"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}
      <span className="relative shrink-0">
        <Icon
          size={17}
          strokeWidth={isActive ? 2 : 1.75}
          className={cn(isActive ? 'text-accent' : 'text-muted group-hover:text-ink-soft')}
        />
        {hasBadge && collapsed && (
          <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-accent ring-2 ring-surface" />
        )}
      </span>
      {!collapsed && <span className="truncate flex-1">{label}</span>}
      {!collapsed && hasBadge && (
        <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-on-accent text-[10.5px] font-semibold flex items-center justify-center tabular">
          {badge! > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

function canSee(item: NavDef, role: string | undefined): boolean {
  if (!item.roles) return true;
  return !!role && (item.roles as string[]).includes(role);
}

interface SidebarContentProps {
  collapsed: boolean;
  /** Mobile drawer mode: shows a close button and closes on navigation. */
  mobile?: boolean;
}

export function SidebarContent({ collapsed, mobile }: SidebarContentProps) {
  const { toggleSidebar, setMobileNavOpen } = useUIStore();
  const { user } = useAuthStore();
  const role = user?.role;

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const res = await apiClient.get('/notifications/unread-count');
      return (res.data?.data ?? res.data)?.count ?? 0;
    },
    refetchInterval: 30000,
  });
  const unreadCount: number = unreadData ?? 0;

  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => canSee(i, role)) })).filter(
    (s) => s.items.length > 0,
  );
  const visibleBottom = BOTTOM_NAV.filter((item) => canSee(item, role));
  const onNavigate = mobile ? () => setMobileNavOpen(false) : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className={cn('flex items-center h-[76px] shrink-0 px-6', collapsed && 'justify-center px-0')}>
        {collapsed ? <LogoMark size={32} /> : <Logo size="sm" />}
        {mobile && (
          <button
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto w-9 h-9 -mr-2 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2"
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav className={cn('flex-1 overflow-y-auto scrollbar-none pt-3 pb-4', collapsed ? 'px-2' : 'px-3')}>
        {sections.map((section, idx) => (
          <div key={section.title} className={cn(idx > 0 && 'mt-5')}>
            {collapsed ? (
              idx > 0 && <div className="mx-auto mb-3 w-6 h-px bg-line" />
            ) : (
              <p className="px-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted/80">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItem
                  key={item.path}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                  badge={item.path === '/notifications' ? unreadCount : undefined}
                />
              ))}
            </div>
          </div>
        ))}

        {visibleBottom.length > 0 && (
          <div className="mt-5">
            {collapsed ? (
              <div className="mx-auto mb-3 w-6 h-px bg-line" />
            ) : (
              <p className="px-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted/80">
                Administration
              </p>
            )}
            <div className="space-y-0.5">
              {visibleBottom.map((item) => (
                <NavItem key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* User + collapse */}
      <div className={cn('shrink-0 border-t border-line', collapsed ? 'p-2' : 'p-3')}>
        {user && (
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl',
              collapsed ? 'justify-center py-2' : 'px-2.5 py-2',
            )}
            title={collapsed ? `${user.firstName} ${user.lastName}` : undefined}
          >
            <Avatar src={user.avatar} firstName={user.firstName} lastName={user.lastName} size="sm" />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink truncate leading-tight">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[11.5px] text-muted truncate leading-tight mt-0.5">
                  {ROLES_LABELS[role ?? ''] ?? role}
                </p>
              </div>
            )}
            {!collapsed && !mobile && (
              <button
                onClick={toggleSidebar}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors"
                title="Réduire le menu"
                aria-label="Réduire le menu"
              >
                <PanelLeftClose size={16} />
              </button>
            )}
          </div>
        )}
        {collapsed && !mobile && (
          <button
            onClick={toggleSidebar}
            className="mt-1 w-10 h-9 mx-auto rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors"
            title="Déployer le menu"
            aria-label="Déployer le menu"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Desktop sidebar (≥ lg). On smaller screens the AppShell renders a drawer instead. */
export function Sidebar() {
  const { sidebarCollapsed } = useUIStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 72 : 256 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="hidden lg:block h-full bg-surface border-r border-line overflow-hidden shrink-0"
    >
      <SidebarContent collapsed={sidebarCollapsed} />
    </motion.aside>
  );
}
