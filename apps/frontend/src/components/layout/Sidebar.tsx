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
  Eraser,
  HandHeart,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../../lib/utils';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { Logo, LogoMark } from '../brand/Logo';
import { apiClient } from '../../lib/apiClient';
import { AI_CONCIERGE_ENABLED } from '../../lib/features';
import { groupsFor, NavGroup, NavPage, pageMatches, RoleKey } from './navigation';

/** Who sees the concierge card at the bottom of the menu. */
const APP_USERS: RoleKey[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'PROVIDER', 'CLIENT'];

interface NavItemProps {
  group: NavGroup & { home: NavPage };
  collapsed: boolean;
  badge?: number;
  onNavigate?: () => void;
}

/** One section of the menu: opens its first page; active on any of its pages. */
function NavItem({ group, collapsed, badge, onNavigate }: NavItemProps) {
  const location = useLocation();
  const { label, icon: Icon } = group;
  const path = group.home.path;
  const isActive = group.pages.some((p) => pageMatches(p, location.pathname));
  const hasBadge = badge != null && badge > 0;
  return (
    <NavLink
      to={path}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 h-10 px-3 rounded-xl text-[14px] transition-colors duration-150',
        isActive
          ? 'bg-primary/10 dark:bg-primary/15 text-ink font-semibold'
          : 'text-ink-soft font-medium hover:text-ink hover:bg-surface-2',
        collapsed && 'justify-center px-0 w-10 mx-auto',
      )}
    >
      <span className="relative shrink-0">
        <Icon
          size={19}
          strokeWidth={isActive ? 2.2 : 1.8}
          className={cn(isActive ? 'text-accent' : 'text-muted group-hover:text-ink-soft')}
        />
        {hasBadge && collapsed && (
          <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-surface" />
        )}
      </span>
      {!collapsed && <span className="truncate flex-1">{label}</span>}
      {!collapsed && hasBadge && (
        <span
          className={cn(
            'ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] font-bold flex items-center justify-center tabular',
            'bg-primary text-on-primary',
          )}
        >
          {badge! > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
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

  const groups = groupsFor(role);
  const onNavigate = mobile ? () => setMobileNavOpen(false) : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className={cn('flex items-center h-16 shrink-0 px-5', collapsed && 'flex-col justify-center gap-2 px-0 h-[96px]')}>
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

      {/* Main nav: a few sections, their pages are tabs at the top of the page */}
      <nav className={cn('flex-1 overflow-y-auto scrollbar-none pt-4 pb-4 space-y-1', collapsed ? 'px-2' : 'px-3')}>
        {groups.map((g) => (
          <div key={g.key} className={cn(g.key === 'settings' && 'pt-3 mt-3 border-t border-line/70')}>
            <NavItem group={g} collapsed={collapsed} onNavigate={onNavigate} badge={g.key === 'messages' ? unreadCount : undefined} />
          </div>
        ))}
      </nav>

      {/* Footer: logout + concierge card */}
      <div className={cn('shrink-0 pt-2', collapsed ? 'px-2 pb-4' : 'px-3 pb-4')}>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Se déconnecter' : undefined}
          className={cn(
            'w-full flex items-center gap-3 h-10 px-3 rounded-xl text-[14px] font-medium text-muted hover:text-danger hover:bg-danger/5 transition-colors',
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

        {!collapsed && AI_CONCIERGE_ENABLED && role && APP_USERS.includes(role as RoleKey) && (
          <div
            className={cn(
              'hidden [@media(min-height:1000px)]:block mt-4 rounded-2xl bg-surface-2 border border-line p-4 text-center',
              !AI_CONCIERGE_ENABLED && 'opacity-60 grayscale',
            )}
            aria-disabled={!AI_CONCIERGE_ENABLED || undefined}
          >
            <span className="mx-auto mb-2.5 w-9 h-9 rounded-full bg-surface flex items-center justify-center shadow-card">
              <BrainCircuit size={17} className={AI_CONCIERGE_ENABLED ? 'text-accent' : 'text-muted'} />
            </span>
            <p className="text-[13.5px] font-bold text-ink">Concierge IA</p>
            <p className="text-[12px] text-muted mt-0.5 leading-snug">Une question sur une villa ou un séjour ?</p>
            <button
              disabled={!AI_CONCIERGE_ENABLED}
              onClick={() => {
                onNavigate?.();
                navigate('/concierge-ia');
              }}
              className="mt-3 h-9 px-5 rounded-full bg-primary text-on-primary text-[12.5px] font-semibold hover:bg-primary-hover transition-colors disabled:bg-line-strong disabled:text-muted disabled:cursor-not-allowed"
            >
              {AI_CONCIERGE_ENABLED ? 'Demander' : 'Bientôt disponible'}
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
      animate={{ width: sidebarCollapsed ? 76 : 236 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="hidden lg:block h-full bg-surface border-r border-line overflow-hidden shrink-0"
    >
      <SidebarContent collapsed={sidebarCollapsed} />
    </motion.aside>
  );
}
