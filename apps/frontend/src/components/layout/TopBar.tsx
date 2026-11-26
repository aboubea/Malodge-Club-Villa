import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bell, Search, LogOut, User, Settings, ChevronDown, Menu, Moon, Sun, CalendarDays, KeyRound } from 'lucide-react';
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
  const { setMobileNavOpen, setTheme, currency, setCurrency, setSearchOpen } = useUIStore();
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

  const hour = new Date().getHours();
  const greeting = hour >= 18 || hour < 5 ? 'Bonsoir' : 'Bonjour';
  const todayRaw = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);

  return (
    <header className="h-[76px] flex items-center gap-3 px-4 sm:px-6 lg:px-8 bg-surface border-b border-line shrink-0 relative z-30">
      {/* Mobile menu */}
      <button
        onClick={() => setMobileNavOpen(true)}
        className="lg:hidden w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
        aria-label="Ouvrir le menu"
      >
        <Menu size={20} />
      </button>

      {/* Greeting */}
      <div className="min-w-0">
        <p className="text-[17px] sm:text-[19px] text-ink leading-tight truncate">
          {greeting}, <span className="font-bold">{user?.firstName}</span>
        </p>
        <p className="hidden sm:flex items-center gap-1.5 text-[12.5px] text-muted mt-1">
          <CalendarDays size={13} />
          {today}
        </p>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Search: opens the global search (Ctrl+K) */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className={cn(
            'relative hidden md:flex items-center w-56 lg:w-64 h-10 pl-10 pr-2 rounded-xl text-[13px] text-muted',
            'bg-surface border border-line hover:border-line-strong transition-colors',
          )}
        >
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" />
          Rechercher
          <kbd className="ml-auto h-6 px-1.5 inline-flex items-center rounded-md border border-line bg-surface-2 text-[11px] font-sans text-muted">{SHORTCUT}</kbd>
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Rechercher"
          className="md:hidden w-10 h-10 rounded-full border border-line bg-surface flex items-center justify-center text-ink-soft"
        >
          <Search size={16} />
        </button>

        {/* Theme */}
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="w-10 h-10 rounded-full border border-line flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
          title={isDark ? 'Passer en thème clair' : 'Passer en thème sombre'}
          aria-label={isDark ? 'Passer en thème clair' : 'Passer en thème sombre'}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Display currency: every amount on screen in MAD or in € (today's rate) */}
        <div
          role="group"
          aria-label="Devise affichée"
          title="Devise affichée : les montants sont convertis au taux du jour"
          className="h-10 rounded-full border border-line p-1 flex items-center"
        >
          {(['MAD', 'EUR'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              aria-pressed={currency === c}
              className={cn(
                'h-8 min-w-[40px] px-2.5 rounded-full text-[12.5px] font-bold transition-colors',
                currency === c ? 'bg-primary text-on-primary' : 'text-ink-soft hover:text-ink',
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
              'relative w-10 h-10 rounded-full border border-line flex items-center justify-center',
              'text-ink-soft hover:text-ink hover:bg-surface-2',
              'transition-colors duration-150',
              notificationsOpen && 'text-ink bg-surface-2',
            )}
            aria-label="Notifications"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-gold ring-2 ring-surface text-[9px] font-bold text-[#2A1A12] flex items-center justify-center tabular">
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
              'flex items-center gap-2.5 pl-1 pr-2 sm:pr-2.5 py-1 ml-1 rounded-full',
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
            <div className="hidden sm:block text-left">
              <p className="text-[13.5px] font-semibold text-ink leading-none">
                {user?.firstName}
              </p>
            </div>
            <ChevronDown
              size={12}
              className={cn(
                'text-muted transition-transform duration-150',
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
