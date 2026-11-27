import { useState } from 'react';
import { chip, chipOff, chipOn } from '../../components/ui/segmented';
import { activityKind } from '../calendar/agendaIcons';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Search, Trash2, X, SlidersHorizontal } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn, formatDay } from '../../lib/utils';
import { ExtraFilters, ExtraLine, Options, STATUS_BADGE, STATUS_LABELS, Totals, api, pct, ruleText, useExtraLines, useExtrasMutation } from './api';
import { ExtraFormModal } from './forms';
import { EmptyState, IssueTag, Money, Segmented, Select, TableCard, TextInput, td, th } from './ui';
import { formatMoney } from '../../lib/utils';
import { ColSpec, ColumnHeader, TableFilterSummary, useTableControls } from '../../components/ui/tableControls';
import { displayCurrency, toDisplay } from '../../lib/display';

/** The totals of the lines shown (same rules as the server): the column filters update them, as in the Excel file. */
function totalsOf(lines: ExtraLine[]): Totals[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const map = new Map<string, Totals & { billedNoCost: number; noCostCount: number; marginBilled: number; netMissing: number }>();
  for (const l of lines) {
    let t = map.get(l.currency);
    if (!t) {
      t = { currency: l.currency, count: 0, incomplete: 0, billed: 0, cost: 0, margin: 0, ownerShare: 0, sellerShare: 0, net: 0, billedNoCost: 0, noCostCount: 0, marginBilled: 0, netMissing: 0 };
      map.set(l.currency, t);
    }
    t.count += 1;
    if (l.cancelled) continue;
    if (l.issue) t.incomplete += 1;
    t.billed += l.total ?? 0;
    t.cost += l.cost ?? 0;
    t.margin += l.margin ?? 0;
    t.ownerShare += l.ownerShare ?? 0;
    t.sellerShare += l.sellerShare ?? 0;
    t.net += l.net ?? 0;
    if (l.total != null && l.cost == null) {
      t.billedNoCost += l.total;
      t.noCostCount += 1;
    }
    if (l.margin != null) t.marginBilled += l.total ?? 0;
    if (l.margin != null && l.net == null) t.netMissing += 1;
  }
  return [...map.values()].map((t) => ({ ...t, billed: r2(t.billed), cost: r2(t.cost), margin: r2(t.margin), ownerShare: r2(t.ownerShare), sellerShare: r2(t.sellerShare), net: r2(t.net) }));
}

/** Totals of several currencies as one, in the display currency (null when a rate is missing). */
function mergeTotals(list: Totals[]): (Totals & { currency: string }) | null {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const target = displayCurrency();
  const keys = ['billed', 'cost', 'margin', 'ownerShare', 'sellerShare', 'net', 'billedNoCost', 'marginBilled'] as const;
  const out: any = { currency: target, count: 0, incomplete: 0, noCostCount: 0, netMissing: 0 };
  keys.forEach((k) => (out[k] = 0));
  for (const t of list) {
    const probe = toDisplay(1, t.currency);
    if (!probe.converted && t.currency !== target) return { ...list[0] };
    const f = probe.amount;
    keys.forEach((k) => (out[k] += ((t as any)[k] ?? 0) * f));
    out.count += t.count;
    out.incomplete += t.incomplete;
    out.noCostCount += t.noCostCount ?? 0;
    out.netMissing += t.netMissing ?? 0;
  }
  // Already converted: shown as is.
  return out;
}

/** What each column sorts and filters on. Owner and seller: their name (filter) — the amounts sort through Net. */
const LINE_COLS: ColSpec<ExtraLine>[] = [
  { key: 'date', label: 'Date', kind: 'date', value: (l) => l.date },
  { key: 'stay', label: 'Client / séjour', value: (l) => l.stay?.label },
  { key: 'villa', label: 'Villa', value: (l) => l.villa?.name },
  { key: 'label', label: 'Prestation', value: (l) => l.label },
  { key: 'provider', label: 'Prestataire', value: (l) => l.provider?.name },
  { key: 'qty', label: 'Qté', kind: 'number', align: 'right', value: (l) => l.quantity },
  { key: 'total', label: 'Total client', kind: 'number', align: 'right', value: (l) => l.total },
  { key: 'cost', label: 'Coût', kind: 'number', align: 'right', value: (l) => l.cost },
  { key: 'margin', label: 'Marge', kind: 'number', align: 'right', value: (l) => l.margin },
  { key: 'owner', label: 'Propriétaire', align: 'right', value: (l) => l.owner?.name },
  { key: 'seller', label: 'Salarié', align: 'right', value: (l) => l.seller?.name },
  { key: 'net', label: 'Net Malodge', kind: 'number', align: 'right', value: (l) => l.net },
  { key: 'status', label: 'Statut', value: (l) => STATUS_LABELS[l.status] },
];

export function LinesTab({ options }: { options: Options | undefined }) {
  const [params, setParams] = useSearchParams();
  const filters: ExtraFilters = {
    stayId: params.get('stayId') ?? '',
    villaId: params.get('villaId') ?? '',
    providerId: params.get('providerId') ?? '',
    ownerId: params.get('ownerId') ?? '',
    sellerId: params.get('sellerId') ?? '',
    status: params.get('status') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    stays: (params.get('stays') as ExtraFilters['stays']) ?? 'active',
    incomplete: params.get('incomplete') === 'true' ? 'true' : undefined,
    search: params.get('search') ?? '',
  };
  const setFilter = (k: keyof ExtraFilters, v: string | undefined) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  // Detailed filters in use (stay, villa, provider, owner, seller, dates): they stay open.
  const detailCount = (['stayId', 'villaId', 'providerId', 'ownerId', 'sellerId', 'from', 'to'] as const).filter((k) => filters[k]).length;
  const [moreFilters, setMoreFilters] = useState(false);
  const showMore = moreFilters || detailCount > 0;
  const activeCount = (['stayId', 'villaId', 'providerId', 'ownerId', 'sellerId', 'status', 'from', 'to', 'search'] as const).filter((k) => filters[k]).length + (filters.incomplete ? 1 : 0);

  const { data, isLoading, isFetching } = useExtraLines(filters);
  const [editing, setEditing] = useState<ExtraLine | null>(null);
  const del = useExtrasMutation(api.deleteExtra, 'Extra supprimé');

  const all = data?.lines ?? [];
  // Sort and filter at the top of the columns (as in the Excel file); the totals follow what is shown.
  const ctl = useTableControls<ExtraLine>('extras-lines', all, LINE_COLS);
  const lines = ctl.rows;
  const totals = ctl.activeCount ? totalsOf(lines) : data?.totals ?? [];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <TextInput
              className="pl-10"
              placeholder="Prestation, séjour, note…"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              aria-label="Rechercher"
            />
          </div>
          <Segmented
            value={filters.stays ?? 'active'}
            onChange={(v) => setFilter('stays', v === 'active' ? undefined : v)}
            options={[
              { value: 'active', label: 'Séjours actifs' },
              { value: 'archived', label: 'Archivés' },
              { value: 'all', label: 'Tous' },
            ]}
          />
          <button
            type="button"
            onClick={() => setFilter('incomplete', filters.incomplete ? undefined : 'true')}
            className={cn(chip, filters.incomplete ? chipOn : chipOff)}
          >
            À compléter
          </button>
          {/* The detailed filters are folded away: the list first */}
          <button type="button" onClick={() => setMoreFilters((v) => !v)} aria-expanded={showMore} className={cn(chip, detailCount ? chipOn : chipOff)}>
            <SlidersHorizontal size={15} /> Filtres{detailCount ? ` · ${detailCount}` : ''}
          </button>
          {activeCount > 0 && (
            <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true })} className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted hover:text-ink">
              <X size={14} /> Effacer les filtres
            </button>
          )}
        </div>
        {showMore && (
        <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-7 gap-3">
          <Select value={filters.stayId} onChange={(e) => setFilter('stayId', e.target.value)} aria-label="Séjour">
            <option value="">Tous les séjours</option>
            {options?.stays.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select value={filters.villaId} onChange={(e) => setFilter('villaId', e.target.value)} aria-label="Villa">
            <option value="">Toutes les villas</option>
            {options?.villas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
          <Select value={filters.providerId} onChange={(e) => setFilter('providerId', e.target.value)} aria-label="Prestataire">
            <option value="">Tous prestataires</option>
            {options?.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select value={filters.ownerId} onChange={(e) => setFilter('ownerId', e.target.value)} aria-label="Propriétaire">
            <option value="">Tous propriétaires</option>
            {options?.owners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select value={filters.sellerId} onChange={(e) => setFilter('sellerId', e.target.value)} aria-label="Vendeur">
            <option value="">Tous vendeurs</option>
            {options?.sellers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <TextInput type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} aria-label="Du" title="Prestations du" />
          <TextInput type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} aria-label="Au" title="Au" />
        </div>
        )}
      </div>

      {/* Totals: one row, in the display currency (each currency converted at today's rate). */}
      {(() => {
        const t = mergeTotals(totals);
        if (!t) return null;
        // Below each card, what it leaves out: so that Billed − Cost = Margin reads right.
        const notes: Record<string, string | null> = {
          cost: t.noCostCount ? `+ ${t.noCostCount} extra${t.noCostCount > 1 ? 's' : ''} sans coût (${formatMoney(t.billedNoCost, t.currency)} facturés)` : null,
          margin: t.marginBilled != null && Math.abs(t.marginBilled - t.billed) > 0.5 ? `sur ${formatMoney(t.marginBilled, t.currency)} facturés avec coût` : null,
          net: t.netMissing ? `${t.netMissing} extra${t.netMissing > 1 ? 's' : ''} sans taux : non compté${t.netMissing > 1 ? 's' : ''}` : null,
        };
        return (
          <div className={cn('grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 transition-opacity', isFetching && 'opacity-60')}>
            {(
              [
                ['Facturé aux clients', t.billed, true, null],
                ['Coût des prestataires', t.cost, false, notes.cost],
                ['Marge brute', t.margin, false, notes.margin],
                ['Part des propriétaires', t.ownerShare, false, t.netMissing ? notes.net : null],
                ['Part des salariés', t.sellerShare, false, null],
                ['Net Malodge', t.net, true, notes.net],
              ] as const
            ).map(([label, value, strong, note]) => (
              <div key={label} className={cn('rounded-2xl px-4 py-3.5', strong ? 'bg-peach' : 'bg-surface border border-line')}>
                <p className="text-[12px] text-muted">{label}</p>
                <Money value={value} currency={t.currency} className="block text-[18px] font-bold text-ink mt-1" />
                {note && <p className="mt-1 text-[11.5px] text-warning leading-snug">{note}</p>}
              </div>
            ))}
          </div>
        );
      })()}
      <p className="text-[12.5px] text-muted -mt-2">
        {lines.length} extra{lines.length > 1 ? 's' : ''} affiché{lines.length > 1 ? 's' : ''}
        {totals[0]?.incomplete ? `, dont ${totals.reduce((s, t) => s + t.incomplete, 0)} à compléter (montants partiels)` : ''}
        {lines.some((l) => l.warning) ? ` — ${lines.filter((l) => l.warning).length} date(s) hors séjour à vérifier` : ''}.
      </p>

      {/* Table */}
      {isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : all.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState title="Aucun extra pour ces filtres" hint="Modifiez les filtres ou ajoutez un extra." />
        </div>
      ) : (
        <>
        <TableFilterSummary ctl={ctl} noun="extra" />
        {/* Phones: one card per extra, tap to edit */}
        <div className="md:hidden rounded-2xl bg-surface border border-line/80 divide-y divide-line/70 overflow-hidden">
          {lines.map((l) => {
            const k = activityKind(l.label);
            return (
              <button key={l.id} type="button" onClick={() => setEditing(l)} className={cn('w-full flex items-start gap-3 px-4 py-3 text-left active:bg-surface-2', l.cancelled && 'opacity-55')}>
                <span className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', k.tone)}>
                  <k.icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-semibold text-ink truncate">{l.label}</span>
                    <Money value={l.total} currency={l.currency} className="text-[15px] font-semibold shrink-0" />
                  </span>
                  <span className="block text-[13px] text-muted truncate">
                    {l.stay?.label ?? '—'} · {l.date ? formatDay(l.date) : 'sans date'}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant={STATUS_BADGE[l.status]}>{STATUS_LABELS[l.status]}</Badge>
                    {l.issue && <IssueTag issue={l.issue} />}
                    {l.margin !== null && !l.cancelled && <span className="text-[12px] text-muted">marge <Money value={l.margin} currency={l.currency} /></span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <TableCard className="hidden md:block">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr>
                <th className={th}><ColumnHeader ctl={ctl} col="date" /></th>
                <th className={th}><ColumnHeader ctl={ctl} col="stay" /></th>
                <th className={th}><ColumnHeader ctl={ctl} col="label" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="qty" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="total" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="cost" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="margin" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="owner" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="seller" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="net" /></th>
                <th className={th}><ColumnHeader ctl={ctl} col="status" /></th>
                <th className={th} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => (
                <tr key={l.id} className={cn('hover:bg-surface-2/50 transition-colors', l.cancelled && 'opacity-55')}>
                  <td className={cn(td, 'whitespace-nowrap text-ink-soft tabular')}>{l.date ? formatDay(l.date) : <IssueTag issue="Sans date" />}</td>
                  <td className={td}>
                    <p className="font-semibold truncate max-w-[180px]">{l.stay?.label ?? '—'}</p>
                    <p className="text-[12px] text-muted truncate max-w-[180px]">{l.villa?.name ?? '—'}</p>
                  </td>
                  <td className={td}>
                    <p className="truncate max-w-[300px]" title={l.label}>
                      {l.label}
                    </p>
                    <p className="text-[12px] text-muted truncate max-w-[300px]">
                      {[l.provider?.name, l.seller && `vendu par ${l.seller.name}`].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {(l.issue || l.warning) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <IssueTag issue={l.issue} />
                        {l.warning && (
                          <span
                            className="inline-flex items-center h-6 px-2 rounded-full bg-info/10 text-info text-[11.5px] font-semibold whitespace-nowrap"
                            title={l.stay?.checkIn ? `Séjour du ${formatDay(l.stay.checkIn)} au ${formatDay(l.stay.checkOut)}` : undefined}
                          >
                            {l.warning}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={cn(td, 'text-right tabular')}>{l.quantity ?? '—'}</td>
                  <td className={cn(td, 'text-right font-semibold')}>
                    <Money value={l.total} currency={l.currency} />
                  </td>
                  <td className={cn(td, 'text-right text-ink-soft')}>
                    <Money value={l.cost} currency={l.currency} />
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <Money value={l.margin} currency={l.currency} className={l.margin !== null && l.margin < 0 ? 'text-danger' : ''} />
                  </td>
                  <td
                    className={cn(td, 'text-right text-ink-soft')}
                    title={l.owner ? `${l.owner.name} · ${l.ownerRule ? `règle : ${ruleText(l.ownerRule, l.currency)}` : `${pct(l.ownerRate)} de la marge (taux habituel)`}` : 'Pas de propriétaire'}
                  >
                    <Money value={l.ownerShare} currency={l.currency} />
                    {l.ownerRule && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-accent align-middle" aria-label="règle de commission" />}
                  </td>
                  <td
                    className={cn(td, 'text-right text-ink-soft')}
                    title={l.seller ? `${l.seller.name} · ${l.sellerRule ? `règle : ${ruleText(l.sellerRule, l.currency)}` : `${pct(l.sellerRate)} (taux habituel)`}` : 'Pas de vendeur'}
                  >
                    <Money value={l.sellerShare} currency={l.currency} />
                    {l.sellerRule && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-accent align-middle" aria-label="règle de commission" />}
                  </td>
                  <td className={cn(td, 'text-right font-semibold')}>
                    <Money value={l.net} currency={l.currency} />
                  </td>
                  <td className={td}>
                    <Badge variant={STATUS_BADGE[l.status]}>{STATUS_LABELS[l.status]}</Badge>
                  </td>
                  <td className={cn(td, 'text-right whitespace-nowrap')}>
                    <button
                      type="button"
                      onClick={() => setEditing(l)}
                      className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2"
                      aria-label={`Modifier ${l.label}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Supprimer l'extra « ${l.label} » ? Pour garder une trace, préférez le statut « Annulée ».`)) del.mutate(l.id);
                      }}
                      className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10"
                      aria-label={`Supprimer ${l.label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
        </>
      )}

      <ExtraFormModal open={!!editing} onClose={() => setEditing(null)} options={options} extra={editing} />
    </div>
  );
}
