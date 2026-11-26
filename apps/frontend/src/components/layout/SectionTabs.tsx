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
    <nav aria-label={group.label} className="-mt-1 mb-6 inline-flex max-w-full items-center gap-0.5 p-1 rounded-full bg-surface-2 overflow-x-auto scrollbar-none">
      {group.pages.map((p) =>
        p.disabled ? (
          <span key={p.path} title={p.disabled} aria-disabled="true" className="h-8 px-4 rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted/60 cursor-not-allowed whitespace-nowrap">
            {p.label}
            <span className="h-5 px-1.5 rounded-full bg-surface-2 text-[10px] text-muted inline-flex items-center">Bientôt</span>
          </span>
        ) : (
          <NavLink
            key={p.path}
            to={p.path}
            end={p.exact}
            className={cn(
              'h-8 px-4 rounded-full inline-flex items-center text-[13px] font-semibold whitespace-nowrap transition-all',
              pageMatches(p, pathname) ? 'bg-surface dark:bg-line-strong text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-muted hover:text-ink',
            )}
          >
            {p.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}
