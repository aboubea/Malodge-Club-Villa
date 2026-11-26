import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  LogOut,
  Wallet,
  ShieldCheck,
  Gauge,
  FileText,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../../lib/utils';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { Logo, LogoMark } from '../brand/Logo';
import { apiClient } from '../../lib/apiClient';

type RoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'PROVIDER' | 'CLIENT' | 'OWNER' | 'EMPLOYEE';

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
/** Everyone except owners and employees, who only have their extras account. */
const APP_USERS: RoleKey[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'PROVIDER', 'CLIENT'];
const ACCOUNT_HOLDERS: RoleKey[] = ['CLIENT', 'PROVIDER', 'OWNER', 'EMPLOYEE'];

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Pilotage',
    items: [
      { path: '/', label: 'Tableau de bord', icon: LayoutDashboard, exact: true, roles: STAFF },
      { path: '/agenda', label: 'Agenda', icon: CalendarRange, roles: STAFF },
      { path: '/finances', label: 'Finances', icon: TrendingUp, roles: STAFF },
      { path: '/performance', label: 'Performance', icon: Gauge, roles: STAFF },
      { path: '/releves', label: 'Relevés propriétaires', icon: FileText, roles: ADMIN_UP },
      { path: '/extras', label: 'Suivi des extras', icon: Wallet, roles: STAFF },
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
    title: 'Mon espace',
    items: [{ path: '/mon-compte', label: 'Mon compte', icon: Wallet, roles: ACCOUNT_HOLDERS }],
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
      { path: '/commandes', label: 'Commandes', icon: ShoppingBag, roles: APP_USERS },
      { path: '/messages', label: 'Messages', icon: MessageSquare, roles: APP_USERS },
      { path: '/concierge-ia', label: 'Concierge IA', icon: BrainCircuit, roles: APP_USERS },
      { path: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
];

const BOTTOM_NAV: NavDef[] = [
  { path: '/utilisateurs', label: 'Utilisateurs', icon: UserCog, roles: ADMIN_UP },
  { path: '/controle', label: 'Contrôle des données', icon: ShieldCheck, roles: ADMIN_UP },
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
        'group relative flex items-center gap-3 h-9 px-3 rounded-[10px] text-[13.5px] transition-colors duration-150',
        isActive
          ? 'bg-primary text-on-primary font-semibold shadow-[0_4px_12px_-4px_rgb(var(--c-primary)/0.45)]'
          : 'text-ink-soft font-medium hover:text-ink hover:bg-surface-2',
        collapsed && 'justify-center px-0 w-10 mx-auto',
      )}
    >
      <span className="relative shrink-0">
        <Icon
          size={17}
          strokeWidth={isActive ? 2.1 : 1.8}
          className={cn(isActive ? 'text-on-primary' : 'text-muted group-hover:text-ink-soft')}
        />
        {hasBadge && collapsed && (
          <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-gold ring-2 ring-surface" />
        )}
      </span>
      {!collapsed && <span className="truncate flex-1">{label}</span>}
      {!collapsed && hasBadge && (
        <span
          className={cn(
            'ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] font-bold flex items-center justify-center tabular',
            isActive ? 'bg-on-primary/20 text-on-primary' : 'bg-gold text-[#2A1A12]',
          )}
        >
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
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
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
      <div className={cn('flex items-center h-[76px] shrink-0 px-6', collapsed && 'flex-col justify-center gap-2 px-0 h-[104px]')}>
        {collapsed ? <LogoMark size={26} /> : <Logo size="sm" />}
        {mobile ? (
          <button
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2"
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>
        ) : (
          <button
            onClick={toggleSidebar}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors',
              !collapsed && 'ml-auto -mr-2',
            )}
            title={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
            aria-label={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav className={cn('flex-1 overflow-y-auto scrollbar-none pt-3 pb-4', collapsed ? 'px-2' : 'px-3')}>
        {sections.map((section, idx) => (
          <div key={section.title} className={cn(idx > 0 && 'mt-4')}>
            {collapsed ? (
              idx > 0 && <div className="mx-auto mb-3 w-6 h-px bg-line" />
            ) : (
              <p className="px-3 mb-1.5 text-[11px] font-semibold text-muted/80">
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
          <div className="mt-4">
            {collapsed ? (
              <div className="mx-auto mb-3 w-6 h-px bg-line" />
            ) : (
              <p className="px-3 mb-1.5 text-[11px] font-semibold text-muted/80">
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

      {/* Footer: logout + concierge card */}
      <div className={cn('shrink-0 border-t border-line pt-3', collapsed ? 'px-2 pb-4' : 'px-3 pb-4')}>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Se déconnecter' : undefined}
          className={cn(
            'w-full flex items-center gap-3 h-9 px-3 rounded-[10px] text-[13.5px] font-medium text-ink-soft hover:text-danger hover:bg-danger/5 transition-colors',
            collapsed && 'justify-center px-0',
          )}
        >
          <LogOut size={17} strokeWidth={1.8} className="text-muted" />
          {!collapsed && 'Se déconnecter'}
        </button>
        {!collapsed && (
          <p
            className="px-3 pt-2 text-[10.5px] text-muted/70 tabular"
            title={`Version déployée le ${new Date(__APP_BUILT_AT__).toLocaleString('fr-FR')}`}
          >
            Version {__APP_VERSION__}
          </p>
        )}

        {!collapsed && role && APP_USERS.includes(role as RoleKey) && (
          <div className="hidden [@media(min-height:1000px)]:block mt-4 rounded-2xl bg-surface-2 border border-line p-4 text-center">
            <span className="mx-auto mb-2.5 w-9 h-9 rounded-full bg-surface flex items-center justify-center shadow-card">
              <BrainCircuit size={17} className="text-accent" />
            </span>
            <p className="text-[13.5px] font-bold text-ink">Concierge IA</p>
            <p className="text-[12px] text-muted mt-0.5 leading-snug">Une question sur une villa ou un séjour ?</p>
            <button
              onClick={() => {
                onNavigate?.();
                navigate('/concierge-ia');
              }}
              className="mt-3 h-9 px-5 rounded-full bg-primary text-on-primary text-[12.5px] font-semibold hover:bg-primary-hover transition-colors"
            >
              Demander
            </button>
          </div>
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
      animate={{ width: sidebarCollapsed ? 76 : 248 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="hidden lg:block h-full bg-surface border-r border-line overflow-hidden shrink-0"
    >
      <SidebarContent collapsed={sidebarCollapsed} />
    </motion.aside>
  );
}
