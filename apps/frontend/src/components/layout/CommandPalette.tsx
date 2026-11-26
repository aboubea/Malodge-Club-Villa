import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BookOpen, Building2, CalendarDays, Clock, Search, Sparkles, UserRound } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { groupsFor } from './navigation';

type Kind = 'page' | 'stay' | 'villa' | 'extra' | 'person' | 'service';
interface Item {
  type: Kind;
  id: string;
  title: string;
  subtitle: string;
  url: string;
}

const GROUP: Record<Kind, { label: string; icon: React.ElementType }> = {
  stay: { label: 'Séjours', icon: CalendarDays },
  villa: { label: 'Villas', icon: Building2 },
  extra: { label: 'Extras', icon: Sparkles },
  person: { label: 'Personnes', icon: UserRound },
  service: { label: 'Catalogue', icon: BookOpen },
  page: { label: 'Pages', icon: ArrowRight },
};
const STAFF = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
const RECENT_KEY = 'malodge.search.recent';
const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const readRecent = (): Item[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
};
const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
export const SHORTCUT = isMac ? '⌘K' : 'Ctrl K';

/**
 * Global search, opened with Ctrl+K (⌘K on a Mac) or the search field of the top bar:
 * stays, villas, people, extras, catalogue (staff), and the pages of the app (everyone).
 */
export function CommandPalette() {
  const open = useUIStore((s) => s.searchOpen);
  const setOpen = useUIStore((s) => s.setSearchOpen);
  const role = useAuthStore((s) => s.user?.role);
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const staff = !!role && STAFF.includes(role);

  // Ctrl+K / ⌘K anywhere; "/" when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? '') || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useUIStore.getState().searchOpen);
      } else if (e.key === '/' && !typing && !useUIStore.getState().searchOpen) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setText('');
      setQ('');
      setActive(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 180);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', q],
    enabled: open && staff && q.length >= 2,
    queryFn: async () => {
      const r = await apiClient.get(`/search?q=${encodeURIComponent(q)}`);
      return ((r.data?.data ?? r.data)?.results ?? []) as Item[];
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // The pages this role can open, matched on their name and their section.
  const pages = useMemo<Item[]>(
    () =>
      groupsFor(role).flatMap((g) =>
        g.pages.filter((p) => !p.disabled).map((p) => ({ type: 'page' as const, id: p.path, title: p.label, subtitle: g.label, url: p.path })),
      ),
    [role],
  );
  const items = useMemo<Item[]>(() => {
    const t = norm(text);
    if (!t) return [...readRecent().slice(0, 6), ...pages.filter((p) => !readRecent().some((r) => r.url === p.url)).slice(0, 8)];
    const pageHits = pages.filter((p) => norm(`${p.title} ${p.subtitle}`).includes(t));
    const found = q.length >= 2 && norm(q) === t ? data ?? [] : [];
    // Kinds in the order of their best result (the server sorts by relevance), pages last.
    const kinds = [...new Set(found.map((x) => x.type))];
    return [...kinds.flatMap((k) => found.filter((x) => x.type === k)), ...pageHits];
  }, [text, q, data, pages]);
  useEffect(() => setActive(0), [items.length, text]);

  const go = (it: Item) => {
    try {
      const recent = [it, ...readRecent().filter((r) => r.url !== it.url)].slice(0, 6);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* no storage */
    }
    setOpen(false);
    navigate(it.url);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // Headings: recent ones first when nothing is typed, then by kind.
  const recentCount = text.trim() ? 0 : Math.min(6, readRecent().length);
  let lastHeading = '';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[10vh] sm:pt-[14vh]">
          <motion.div className="absolute inset-0 bg-[rgb(20_16_10/0.45)] backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} onClick={() => setOpen(false)} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Recherche"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-[640px] rounded-2xl border border-line bg-surface shadow-pop overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
              <Search size={18} className="text-muted shrink-0" />
              <input
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={staff ? 'Client, villa, extra, prestataire, page…' : 'Aller à une page…'}
                className="flex-1 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted"
                aria-controls="search-results"
                aria-activedescendant={items[active] ? `search-${active}` : undefined}
              />
              {isFetching && <span className="w-4 h-4 rounded-full border-2 border-line border-t-accent animate-spin" aria-hidden />}
              <kbd className="hidden sm:inline-flex h-6 px-1.5 items-center rounded-md border border-line text-[11px] text-muted">Échap</kbd>
            </div>

            <div ref={list} id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
              {items.length === 0 && (
                <p className="px-4 py-8 text-center text-[13.5px] text-muted">
                  {text.trim().length < 2 ? 'Tapez au moins deux lettres.' : isFetching ? 'Recherche…' : `Aucun résultat pour « ${text.trim()} ».`}
                </p>
              )}
              {items.map((it, i) => {
                const heading = i < recentCount ? 'Récents' : GROUP[it.type].label;
                const show = heading !== lastHeading;
                lastHeading = heading;
                const Icon = i < recentCount ? Clock : GROUP[it.type].icon;
                return (
                  <div key={`${it.type}-${it.id}-${i}`}>
                    {show && <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{heading}</p>}
                    <button
                      type="button"
                      id={`search-${i}`}
                      data-i={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(it)}
                      className={cn('w-full flex items-center gap-3 px-4 py-2 text-left', i === active ? 'bg-surface-2' : '')}
                    >
                      <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', i === active ? 'bg-surface text-ink' : 'bg-surface-2 text-ink-soft')}>
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-ink truncate">{it.title}</span>
                        {it.subtitle && <span className="block text-[12px] text-muted truncate">{it.subtitle}</span>}
                      </span>
                      {i === active && <ArrowRight size={14} className="text-muted shrink-0" />}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="hidden sm:flex items-center gap-4 px-4 h-10 border-t border-line text-[11.5px] text-muted">
              <span>
                <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> naviguer
              </span>
              <span>
                <kbd className="font-sans">Entrée</kbd> ouvrir
              </span>
              <span className="ml-auto">{SHORTCUT} partout dans l’appli</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
