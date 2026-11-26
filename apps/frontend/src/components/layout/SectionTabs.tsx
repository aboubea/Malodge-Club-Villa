import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../lib/utils';
import { groupOf, pageMatches } from './navigation';

/** The pages of the current section, as tabs at the top of the page. */
export function SectionTabs() {
  const { pathname } = useLocation();
  const role = useAuthStore((s) => s.user?.role);
  const group = groupOf(pathname, role);
  if (!group || group.pages.length < 2) return null;
  return (
    <nav aria-label={group.label} className="-mt-2 mb-6 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
      {group.pages.map((p) =>
        p.disabled ? (
          <span key={p.path} title={p.disabled} aria-disabled="true" className="h-9 px-4 rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted/60 cursor-not-allowed whitespace-nowrap">
            {p.label}
            <span className="h-5 px-1.5 rounded-full bg-surface-2 text-[10px] text-muted inline-flex items-center">Bientôt</span>
          </span>
        ) : (
          <NavLink
            key={p.path}
            to={p.path}
            end={p.exact}
            className={cn(
              'h-9 px-4 rounded-full inline-flex items-center text-[13px] font-semibold whitespace-nowrap transition-colors border',
              pageMatches(p, pathname) ? 'bg-primary text-on-primary border-primary' : 'bg-surface text-ink-soft border-line hover:text-ink hover:border-line-strong',
            )}
          >
            {p.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}
