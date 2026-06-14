import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Sparkles,
  Users,
  Briefcase,
  TrendingUp,
  FolderOpen,
  UserCog,
  Settings,
  ChevronLeft,
  ChevronRight,
  Crown,
  ShoppingBag,
  MessageSquare,
  BrainCircuit,
  Bell,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/villas', label: 'Villas', icon: Building2 },
  { path: '/reservations', label: 'Réservations', icon: CalendarDays },
  { path: '/commandes', label: 'Commandes', icon: ShoppingBag },
  { path: '/services', label: 'Services', icon: Sparkles },
  { path: '/clients', label: 'Clients', icon: Users },
  { path: '/prestataires', label: 'Prestataires', icon: Briefcase },
  { path: '/finances', label: 'Finances', icon: TrendingUp },
  { path: '/documents', label: 'Documents', icon: FolderOpen },
  { path: '/messages', label: 'Messages', icon: MessageSquare },
  { path: '/concierge-ia', label: 'Concierge IA', icon: BrainCircuit },
  { path: '/notifications', label: 'Notifications', icon: Bell },
];

const BOTTOM_NAV = [
  { path: '/utilisateurs', label: 'Utilisateurs', icon: UserCog },
  { path: '/parametres', label: 'Paramètres', icon: Settings },
];

interface NavItemProps {
  path: string;
  label: string;
  Icon: React.ElementType;
  collapsed: boolean;
  exact?: boolean;
}

function NavItem({ path, label, Icon, collapsed, exact }: NavItemProps) {
  const location = useLocation();
  const isActive = exact
    ? location.pathname === path
    : location.pathname.startsWith(path);

  return (
    <NavLink
      to={path}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative',
        isActive
          ? 'bg-[#C9A96E]/10 text-[#C9A96E]'
          : 'text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D]',
        collapsed && 'justify-center px-2',
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#C9A96E] rounded-r-full" />
      )}
      <Icon size={16} className="shrink-0" />
      {!collapsed && (
        <span className="text-sm font-light truncate">{label}</span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { user } = useAuthStore();

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 56 : 220 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex flex-col h-full bg-[#0A0A0B] border-r border-[#242428] overflow-hidden shrink-0"
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-5 border-b border-[#242428]',
          sidebarCollapsed && 'justify-center px-2',
        )}
      >
        <div className="w-7 h-7 rounded-lg bg-[#C9A96E] flex items-center justify-center shrink-0">
          <Crown size={14} className="text-[#0A0A0B]" />
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
            >
              <p className="text-[13px] font-medium text-[#F5F0EB] leading-none">Malodge</p>
              <p className="text-[10px] text-[#6B6B6F] leading-none mt-0.5">Club Villa</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.path}
            path={item.path}
            label={item.label}
            Icon={item.icon}
            collapsed={sidebarCollapsed}
            exact={item.exact}
          />
        ))}
      </nav>

      {/* Bottom nav + user */}
      <div className="px-2 py-3 space-y-0.5 border-t border-[#242428]">
        {BOTTOM_NAV.map((item) => (
          <NavItem
            key={item.path}
            path={item.path}
            label={item.label}
            Icon={item.icon}
            collapsed={sidebarCollapsed}
          />
        ))}

        {/* User info */}
        {!sidebarCollapsed && user && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 mt-1 rounded-lg border border-[#242428] bg-[#111113]">
            <Avatar
              src={user.avatar}
              firstName={user.firstName}
              lastName={user.lastName}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#F5F0EB] truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-[10px] text-[#6B6B6F] truncate">{user.role}</p>
            </div>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className={cn(
          'flex items-center justify-center h-10 border-t border-[#242428]',
          'text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#111113]',
          'transition-colors duration-150',
        )}
      >
        {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </motion.aside>
  );
}
