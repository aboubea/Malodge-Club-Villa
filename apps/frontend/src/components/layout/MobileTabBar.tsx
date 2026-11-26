import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Home, Inbox, LayoutGrid, LogOut, MessageCircle, Moon, Plus, Sparkles, Sun, Wallet } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useIsDark } from '../../hooks/useTheme';
import { groupsFor, pageMatches } from './navigation';
import { QUICK_ACTIONS, STAFF_ROLES } from './quickActions';

/** A sheet rising from the bottom of the screen, as on iPhone. */
function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => (i.offset.y > 90 || i.velocity.y > 500) && onClose()}
            className="absolute inset-x-0 bottom-0 max-h-[86dvh] overflow-y-auto rounded-t-3xl bg-surface shadow-pop pb-[calc(env(safe-area-inset-bottom)+12px)]"
          >
            <div className="sticky top-0 bg-surface pt-2.5 pb-2 z-10">
              <div className="mx-auto w-10 h-1.5 rounded-full bg-line-strong" />
              <p className="mt-3 px-5 text-[17px] font-semibold text-ink">{title}</p>
            </div>
            <div className="px-3 pb-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * Phone navigation: four or five tabs at the bottom, like an iPhone app. For the team:
 * Accueil · Séjours · + (add) · Extras · Plus (the other sections, theme, log out).
 */
export function MobileTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { mobileNavOpen: moreOpen, setMobileNavOpen: setMoreOpen, searchOpen, setTheme, addOpen, setAddOpen } = useUIStore();
  const isDark = useIsDark();
  const role = user?.role;
  const staff = !!role && STAFF_ROLES.includes(role);
  const groups = groupsFor(role);

  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => ((await apiClient.get('/notifications/unread-count')).data?.data ?? {}).count ?? 0,
    refetchInterval: 30000,
  });

  // The team: home, stays, (+), extras, more. Others: their first sections, then "Plus".
  const pinnedKeys = staff ? ['home', 'stays', 'extras'] : groups.slice(0, groups.length > 5 ? 4 : 5).map((g) => g.key);
  const pinned = pinnedKeys.map((k) => groups.find((g) => g.key === k)).filter(Boolean) as typeof groups;
  const rest = groups.filter((g) => !pinnedKeys.includes(g.key));
  const isIn = (g: (typeof groups)[number]) => g.pages.some((p) => pageMatches(p, pathname));
  const moreActive = rest.some(isIn);

  const tab = (g: (typeof groups)[number]) => (
    <NavLink key={g.key} to={g.home.path} className={cn('flex-1 h-14 flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold', isIn(g) ? 'text-accent' : 'text-muted')}>
      <g.icon size={23} strokeWidth={isIn(g) ? 2.2 : 1.8} />
      {g.label}
    </NavLink>
  );

  // Clients: their own pages as the tabs, like an app (séjour, services, demandes, messages, compte).
  const CLIENT_TABS = [
    { path: '/mes-sejours', label: 'Séjour', icon: Home },
    { path: '/catalogue', label: 'Services', icon: Sparkles },
    { path: '/commandes', label: 'Demandes', icon: Inbox },
    { path: '/messages', label: 'Messages', icon: MessageCircle },
    { path: '/mon-compte', label: 'Compte', icon: Wallet },
  ];
  const isClient = role === 'CLIENT';

  if (searchOpen) return null;
  return (
    <>
      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-surface/90 backdrop-blur-xl border-t border-line/70 pb-[env(safe-area-inset-bottom)]" aria-label="Navigation">
        <div className="flex items-stretch max-w-xl mx-auto">
          {isClient ? (
            CLIENT_TABS.map((t) => {
              const on = pathname === t.path || pathname.startsWith(`${t.path}/`);
              return (
                <NavLink key={t.path} to={t.path} className={cn('relative flex-1 h-14 flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold', on ? 'text-accent' : 'text-muted')}>
                  <t.icon size={23} strokeWidth={on ? 2.2 : 1.8} />
                  {t.label}
                  {t.path === '/messages' && unread > 0 && <span className="absolute top-2 right-[calc(50%-18px)] w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface" />}
                </NavLink>
              );
            })
          ) : staff ? (
            <>
              {pinned.slice(0, 2).map(tab)}
              <div className="flex-1 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  aria-label="Ajouter"
                  className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lift active:scale-95 transition-transform"
                >
                  <Plus size={24} strokeWidth={2.4} />
                </button>
              </div>
              {pinned.slice(2).map(tab)}
            </>
          ) : (
            pinned.map(tab)
          )}
          {!isClient && rest.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn('relative flex-1 h-14 flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold', moreActive ? 'text-accent' : 'text-muted')}
            >
              <LayoutGrid size={23} strokeWidth={moreActive ? 2.2 : 1.8} />
              Plus
              {unread > 0 && <span className="absolute top-2 right-[calc(50%-18px)] w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface" />}
            </button>
          )}
        </div>
      </nav>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Ajouter">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => {
              setAddOpen(false);
              navigate(a.url);
            }}
            className="w-full flex items-center gap-3.5 rounded-2xl px-3 py-3 text-left active:bg-surface-2"
          >
            <span className="w-11 h-11 rounded-2xl bg-peach text-accent flex items-center justify-center shrink-0">
              <a.icon size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-semibold text-ink">{a.label}</span>
              <span className="block text-[13px] text-muted truncate">{a.hint}</span>
            </span>
            <ChevronRight size={18} className="text-line-strong" />
          </button>
        ))}
      </Sheet>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Plus">
        <div className="space-y-4">
          {rest.map((g) => (
            <div key={g.key} className="rounded-2xl bg-surface-2/60 overflow-hidden">
              {g.pages
                .filter((p) => !p.disabled)
                .map((p, i) => (
                  <NavLink
                    key={p.path}
                    to={p.path}
                    onClick={() => setMoreOpen(false)}
                    className={cn('flex items-center gap-3 px-4 h-12 text-[15px] active:bg-line/60', i > 0 && 'border-t border-line/70', pageMatches(p, pathname) ? 'text-accent font-semibold' : 'text-ink')}
                  >
                    {i === 0 ? <g.icon size={19} className="text-muted" /> : <span className="w-[19px]" />}
                    <span className="flex-1">{p.label}</span>
                    {g.key === 'messages' && i === 0 && unread > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center">{unread}</span>
                    )}
                    <ChevronRight size={17} className="text-line-strong" />
                  </NavLink>
                ))}
            </div>
          ))}
          <div className="rounded-2xl bg-surface-2/60 overflow-hidden">
            <button type="button" onClick={() => setTheme(isDark ? 'light' : 'dark')} className="w-full flex items-center gap-3 px-4 h-12 text-[15px] text-ink active:bg-line/60">
              {isDark ? <Sun size={19} className="text-muted" /> : <Moon size={19} className="text-muted" />}
              <span className="flex-1 text-left">{isDark ? 'Thème clair' : 'Thème sombre'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                logout();
                navigate('/login');
              }}
              className="w-full flex items-center gap-3 px-4 h-12 text-[15px] text-danger border-t border-line/70 active:bg-line/60"
            >
              <LogOut size={19} />
              <span className="flex-1 text-left">Se déconnecter</span>
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
