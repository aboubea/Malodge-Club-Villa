import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Sort and filter at the top of a table, as in Excel: a click on a column title
 * sorts (ascending, descending, then back to the table's order); the funnel filters
 * the column by its values (ticked list with search), by amount (min / max) or by
 * date (from / to). Kept for the session, per table.
 */

export type ColKind = 'text' | 'number' | 'date';
export type CellValue = string | number | Date | null | undefined;

export interface ColSpec<T> {
  key: string;
  label: string;
  value: (row: T) => CellValue;
  kind?: ColKind;
  align?: 'left' | 'right' | 'center';
  /** Default true. */
  sortable?: boolean;
  /** Default true. */
  filterable?: boolean;
}

export type FilterState = { values?: string[]; min?: string; max?: string; from?: string; to?: string };
export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const EMPTY = '(vide)';
const text = (v: CellValue) => (v == null || v === '' ? EMPTY : v instanceof Date ? v.toLocaleDateString('fr-FR') : String(v));
const num = (v: CellValue) => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};
const dateNum = (v: CellValue) => {
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isNaN(t) ? 0 : t;
};
const dayOf = (v: CellValue) => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const read = <S,>(key: string, fallback: S): S => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as S) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* no storage */
  }
};

/** The rows kept by the filters, in the order asked (empty cells always last). */
export function filterAndSort<T>(rows: T[], cols: ColSpec<T>[], sort: SortState, filters: Record<string, FilterState>): T[] {
  const byKey = new Map(cols.map((c) => [c.key, c]));
  const active = Object.entries(filters).filter(([k, f]) => byKey.has(k) && (f.values || f.min || f.max || f.from || f.to));
  let out = rows.filter((r) =>
    active.every(([k, f]) => {
      const c = byKey.get(k)!;
      const v = c.value(r);
      if (f.values) return f.values.includes(text(v));
      if (c.kind === 'number') {
        const n = num(v);
        if (f.min && (n == null || n < Number(f.min))) return false;
        if (f.max && (n == null || n > Number(f.max))) return false;
        return true;
      }
      if (c.kind === 'date') {
        const d = dayOf(v);
        if (f.from && (!d || d < f.from)) return false;
        if (f.to && (!d || d > f.to)) return false;
        return true;
      }
      return true;
    }),
  );
  const c = sort && byKey.get(sort.key);
  if (c) {
    const dir = sort!.dir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      const va = c.value(a);
      const vb = c.value(b);
      const ea = va == null || va === '';
      const eb = vb == null || vb === '';
      if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
      if (c.kind === 'number' || c.kind === 'date' || typeof va === 'number') return ((num(va) ?? dateNum(va)) - (num(vb) ?? dateNum(vb))) * dir;
      return text(va).localeCompare(text(vb), 'fr', { numeric: true, sensitivity: 'base' }) * dir;
    });
  }
  return out;
}

export function useTableControls<T>(id: string, rows: T[], cols: ColSpec<T>[]) {
  const storeKey = `malodge.table.${id}`;
  const [sort, setSortState] = useState<SortState>(() => read<{ sort: SortState }>(storeKey, { sort: null }).sort);
  const [filters, setFilters] = useState<Record<string, FilterState>>(() => read<{ filters: Record<string, FilterState> }>(storeKey, { filters: {} }).filters ?? {});
  useEffect(() => write(storeKey, { sort, filters }), [storeKey, sort, filters]);

  const byKey = useMemo(() => new Map(cols.map((c) => [c.key, c])), [cols]);
  const active = Object.entries(filters).filter(([k, f]) => byKey.has(k) && (f.values || f.min || f.max || f.from || f.to));

  const shown = useMemo(() => filterAndSort(rows, cols, sort, filters), [rows, cols, sort, filters]);

  const toggleSort = (key: string) =>
    setSortState((s) => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));
  const setFilter = (key: string, f: FilterState | null) =>
    setFilters((all) => {
      const next = { ...all };
      if (f && (f.values || f.min || f.max || f.from || f.to)) next[key] = f;
      else delete next[key];
      return next;
    });

  return {
    rows: shown,
    total: rows.length,
    all: rows,
    cols: byKey,
    sort,
    filters,
    activeCount: active.length,
    activeLabels: active.map(([k]) => byKey.get(k)!.label),
    toggleSort,
    setSort: (key: string, dir: 'asc' | 'desc') => setSortState({ key, dir }),
    setFilter,
    clear: () => {
      setFilters({});
      setSortState(null);
    },
  };
}

export type TableControls<T> = ReturnType<typeof useTableControls<T>>;

/** A column title: click to sort, funnel to filter. */
export function ColumnHeader<T>({ ctl, col, className, children }: { ctl: TableControls<T>; col: string; className?: string; children?: ReactNode }) {
  const c = ctl.cols.get(col);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  if (!c) return <>{children}</>;
  const sorted = ctl.sort?.key === col ? ctl.sort.dir : null;
  const filtered = !!ctl.filters[col];
  const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <span className={cn('inline-flex items-center gap-0.5 group/col', className)}>
      {c.sortable === false ? (
        <span>{children ?? c.label}</span>
      ) : (
        <button
          type="button"
          onClick={() => ctl.toggleSort(col)}
          title={sorted === 'asc' ? 'Trié croissant · cliquer pour décroissant' : sorted === 'desc' ? 'Trié décroissant · cliquer pour annuler le tri' : 'Trier'}
          className={cn('inline-flex items-center gap-1 rounded-md hover:text-ink transition-colors', sorted && 'text-ink')}
        >
          {children ?? c.label}
          <SortIcon size={12} className={cn(sorted ? 'opacity-100 text-accent' : 'opacity-0 group-hover/col:opacity-60')} />
        </button>
      )}
      {c.filterable !== false && (
        <button
          ref={anchor}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Filtrer « ${c.label} »`}
          title="Filtrer"
          className={cn(
            'w-6 h-6 inline-flex items-center justify-center rounded-md transition-colors',
            filtered ? 'text-accent bg-accent/10' : 'text-muted opacity-40 group-hover/col:opacity-100 hover:bg-surface-2 hover:text-ink',
          )}
        >
          <Filter size={11} fill={filtered ? 'currentColor' : 'none'} />
        </button>
      )}
      {open && <FilterPopover ctl={ctl} col={col} anchor={anchor.current} onClose={() => setOpen(false)} />}
    </span>
  );
}

function FilterPopover<T>({ ctl, col, anchor, onClose }: { ctl: TableControls<T>; col: string; anchor: HTMLElement | null; onClose: () => void }) {
  const c = ctl.cols.get(col)!;
  const current = ctl.filters[col] ?? {};
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<FilterState>(current);

  // Values of the column (over the whole table), with how many rows have each.
  const values = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of ctl.all) {
      const k = text(c.value(r));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => (a === EMPTY ? 1 : b === EMPTY ? -1 : a.localeCompare(b, 'fr', { numeric: true })));
  }, [ctl.all, c]);
  const byRange = c.kind === 'number' || c.kind === 'date';
  const ticked = new Set(draft.values ?? values.map(([v]) => v));
  const visible = values.filter(([v]) => v.toLowerCase().includes(q.trim().toLowerCase()));

  // Under its funnel, inside the window; it follows the page when it scrolls.
  const place = () => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = 280;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) });
  };
  useLayoutEffect(place, [anchor]);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const scroll = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) place();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [anchor, onClose]);

  const apply = (f: FilterState | null) => {
    ctl.setFilter(col, f);
    onClose();
  };
  const toggle = (v: string) => {
    const next = new Set(ticked);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setDraft({ values: next.size === values.length ? undefined : [...next] });
  };
  if (!pos) return null;

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={`Filtrer ${c.label}`}
      style={{ top: pos.top, left: pos.left, width: 280 }}
      className="fixed z-[70] rounded-2xl border border-line bg-surface shadow-pop p-3 text-[13px] text-ink normal-case tracking-normal font-normal text-left"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="font-semibold">{c.label}</p>
        <div className="flex gap-1">
          {(['asc', 'desc'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => ctl.setSort(col, d)}
              className={cn('h-7 px-2 rounded-lg border text-[12px] inline-flex items-center gap-1', ctl.sort?.key === col && ctl.sort.dir === d ? 'border-ink bg-ink text-surface' : 'border-line hover:border-line-strong')}
            >
              {d === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {c.kind === 'number' ? (d === 'asc' ? '1→9' : '9→1') : c.kind === 'date' ? (d === 'asc' ? 'Ancien' : 'Récent') : d === 'asc' ? 'A→Z' : 'Z→A'}
            </button>
          ))}
        </div>
      </div>

      {byRange && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(c.kind === 'number' ? (['min', 'max'] as const) : (['from', 'to'] as const)).map((k) => (
            <label key={k} className="block">
              <span className="block text-[11px] text-muted mb-0.5">{{ min: 'Minimum', max: 'Maximum', from: 'Du', to: 'Au' }[k]}</span>
              <input
                type={c.kind === 'number' ? 'number' : 'date'}
                value={draft[k] ?? ''}
                onChange={(e) => setDraft({ ...draft, values: undefined, [k]: e.target.value || undefined })}
                className="w-full h-9 rounded-lg border border-line bg-surface px-2 text-[13px]"
              />
            </label>
          ))}
        </div>
      )}

      {(!byRange || values.length <= 60) && (
        <>
          {values.length > 8 && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher une valeur"
              className="w-full h-9 rounded-lg border border-line bg-surface px-2.5 mb-2 text-[13px]"
            />
          )}
          <label className="flex items-center gap-2 py-1 font-semibold cursor-pointer">
            <input type="checkbox" checked={ticked.size === values.length} onChange={() => setDraft({ values: ticked.size === values.length ? [] : undefined })} />
            Tout sélectionner
          </label>
          <div className="max-h-56 overflow-y-auto -mx-1 px-1">
            {visible.map(([v, n]) => (
              <label key={v} className="flex items-center gap-2 py-1 cursor-pointer">
                <input type="checkbox" checked={ticked.has(v)} onChange={() => toggle(v)} />
                <span className={cn('min-w-0 flex-1 truncate', v === EMPTY && 'italic text-muted')}>{v}</span>
                <span className="text-[11px] text-muted tabular">{n}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-line">
        <button type="button" onClick={() => apply(null)} className="text-[12.5px] font-semibold text-muted hover:text-ink">
          Effacer
        </button>
        <button type="button" onClick={() => apply(draft)} className="h-8 px-4 rounded-full bg-primary text-on-primary text-[12.5px] font-semibold">
          Appliquer
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** "12 lignes sur 40 · filtres : Villa, Statut · Effacer", shown only when something is filtered or sorted. */
export function TableFilterSummary<T>({ ctl, className, noun = 'ligne' }: { ctl: TableControls<T>; className?: string; noun?: string }) {
  if (!ctl.activeCount && !ctl.sort) return null;
  const sortCol = ctl.sort && ctl.cols.get(ctl.sort.key);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-soft', className)}>
      {ctl.activeCount > 0 && (
        <span>
          <b className="text-ink tabular">{ctl.rows.length}</b> {noun}
          {ctl.rows.length > 1 ? 's' : ''} sur {ctl.total} · filtré par {ctl.activeLabels.join(', ')}
        </span>
      )}
      {sortCol && (
        <span>
          Trié par {sortCol.label} ({ctl.sort!.dir === 'asc' ? 'croissant' : 'décroissant'})
        </span>
      )}
      <button type="button" onClick={ctl.clear} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
        <X size={12} /> Tout effacer
      </button>
    </div>
  );
}
