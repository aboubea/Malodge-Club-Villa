import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bell, Search, LogOut, User, Settings, ChevronDown, Moon, Sun, KeyRound } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { formatDistanceToNow } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';
import { useUIStore } from '../../store/uiStore';
import { useIsDark } from '../../hooks/useTheme';
import { SHORTCUT } from './CommandPalette';
import { QuickAdd } from './QuickAdd';
import { STAFF_ROLES } from './quickActions';
import { LogoMark } from '../brand/Logo';
import { ROLES_LABELS } from '../../lib/constants';
import { ChangePasswordModal } from '../../features/auth/ChangePasswordModal';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export function TopBar() {
  const { user, logout } = useAuthStore();
  const { setTheme, currency, setCurrency, setSearchOpen } = useUIStore();
  const isDark = useIsDark();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: notifData } = useQuery({
    queryKey: ['notifications-topbar'],
    queryFn: () =>
      apiClient.get('/notifications', { params: { limit: 10 } })
        .then((r) => (r.data?.data ?? r.data) as Notification[]),
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-topbar'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-topbar'] }),
  });

  const notifications = Array.isArray(notifData) ? notifData : [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const staff = !!user?.role && STAFF_ROLES.includes(user.role);

  return (
    <header className="h-16 flex items-center gap-2 px-4 sm:px-6 lg:px-10 bg-canvas/80 backdrop-blur-xl border-b border-line/70 shrink-0 relative z-30">
      {/* Phone: the brand (navigation is the tab bar at the bottom) */}
      <Link to="/" className="lg:hidden shrink-0" aria-label="Accueil">
        <LogoMark size={26} />
      </Link>

      {/* Search: opens the global search (Ctrl+K) */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="hidden md:flex items-center gap-2.5 w-[300px] lg:w-[380px] h-10 pl-3.5 pr-2 rounded-full bg-surface-2 text-[14px] text-muted hover:bg-line/70 transition-colors"
      >
        <Search size={16} />
        Rechercher un client, une villa…
        <kbd className="ml-auto h-6 px-2 inline-flex items-center rounded-full bg-surface text-[11px] font-sans font-semibold text-muted">{SHORTCUT}</kbd>
      </button>

      {/* Right side */}
      <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Rechercher"
          className="md:hidden w-10 h-10 rounded-full flex items-center justify-center text-ink-soft hover:bg-surface-2"
        >
          <Search size={19} />
        </button>

        {staff && <QuickAdd />}

        {/* Display currency: every amount on screen in MAD or in € (today's rate) */}
        <div
          role="group"
          aria-label="Devise affichée"
          title="Devise affichée : les montants sont convertis au taux du jour"
          className="h-9 rounded-full bg-surface-2 p-0.5 flex items-center"
        >
          {(['MAD', 'EUR'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              aria-pressed={currency === c}
              className={cn(
                'h-8 min-w-[38px] px-2.5 rounded-full text-[12.5px] font-bold transition-all',
                currency === c ? 'bg-surface dark:bg-line-strong text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-muted hover:text-ink',
              )}
            >
              {c === 'EUR' ? '€' : 'MAD'}
            </button>
          ))}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className={cn(
              'relative w-10 h-10 rounded-full flex items-center justify-center',
              'text-ink-soft hover:text-ink hover:bg-surface-2',
              'transition-colors duration-150',
              notificationsOpen && 'text-ink bg-surface-2',
            )}
            aria-label="Notifications"
          >
            <Bell size={19} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-primary ring-2 ring-canvas text-[9.5px] font-bold text-on-primary flex items-center justify-center tabular">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'absolute -right-12 sm:right-0 top-12 w-[min(22rem,calc(100vw-2rem))] overflow-hidden',
                  'bg-surface border border-line rounded-2xl',
                  'shadow-pop z-50',
                )}
              >
                <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllReadMutation.mutate()}
                      className="text-xs text-accent hover:text-accent-hover transition-colors"
                    >
                      Tout lire
                    </button>
                  )}
                </div>
                <div className="py-1 max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-muted text-center py-6">Aucune notification</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => { if (!n.isRead) markReadMutation.mutate(n.id); }}
                        className={cn(
                          'flex items-start gap-3 px-4 py-3 hover:bg-surface-2 transition-colors cursor-pointer relative',
                          !n.isRead && 'bg-surface-2/50',
                        )}
                      >
                        {!n.isRead && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-accent rounded-r-full" />
                        )}
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                          n.type === 'success' ? 'bg-success' :
                          n.type === 'warning' ? 'bg-warning' :
                          n.type === 'error' ? 'bg-danger' : 'bg-accent'
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm', n.isRead ? 'text-muted' : 'text-ink')}>
                            {n.title}
                          </p>
                          <p className="text-xs text-muted mt-0.5 line-clamp-1">{n.body}</p>
                          <p className="text-[10px] text-muted mt-0.5">
                            {formatDistanceToNow(n.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-line">
                  <Link
                    to="/notifications"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    Voir toutes les notifications →
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={cn(
              'flex items-center gap-1.5 p-1 sm:pr-2 rounded-full',
              'hover:bg-surface-2 transition-colors duration-150',
              userMenuOpen && 'bg-surface-2',
            )}
            aria-label="Menu utilisateur"
          >
            <Avatar
              src={user?.avatar}
              firstName={user?.firstName}
              lastName={user?.lastName}
              size="sm"
            />
            <ChevronDown
              size={12}
              className={cn(
                'hidden sm:block text-muted transition-transform duration-150',
                userMenuOpen && 'rotate-180',
              )}
            />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'absolute right-0 top-12 w-60',
                  'bg-surface border border-line rounded-2xl',
                  'shadow-pop z-50',
                  'py-1.5',
                )}
              >
                <div className="px-4 py-2.5 border-b border-line">
                  <p className="text-sm font-medium text-ink">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-muted truncate">{user?.email}</p>
                  <p className="text-[11px] font-medium text-accent mt-1">{ROLES_LABELS[user?.role ?? ''] ?? user?.role}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/parametres'); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
                  >
                    <User size={14} /> Mon profil
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/parametres'); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
                  >
                    <Settings size={14} /> Paramètres
                  </button>
                  <button
                    onClick={() => setTheme(isDark ? 'light' : 'dark')}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
                  >
                    {isDark ? <Sun size={14} /> : <Moon size={14} />} {isDark ? 'Thème clair' : 'Thème sombre'}
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); setPasswordOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
                  >
                    <KeyRound size={14} /> Changer mon mot de passe
                  </button>
                </div>
                <div className="pt-1 border-t border-line">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
                  >
                    <LogOut size={14} /> Se déconnecter
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </header>
  );
}
