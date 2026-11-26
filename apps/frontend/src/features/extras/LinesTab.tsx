import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Search, Trash2, X } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn, formatDate } from '../../lib/utils';
import { ExtraFilters, ExtraLine, Options, STATUS_BADGE, STATUS_LABELS, api, pct, useExtraLines, useExtrasMutation } from './api';
import { ExtraFormModal } from './forms';
import { EmptyState, IssueTag, Money, Segmented, Select, TableCard, TextInput, td, th } from './ui';

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
  const activeCount = (['stayId', 'villaId', 'providerId', 'ownerId', 'sellerId', 'status', 'from', 'to', 'search'] as const).filter((k) => filters[k]).length + (filters.incomplete ? 1 : 0);

  const { data, isLoading, isFetching } = useExtraLines(filters);
  const [editing, setEditing] = useState<ExtraLine | null>(null);
  const del = useExtrasMutation(api.deleteExtra, 'Extra supprimé');

  const lines = data?.lines ?? [];

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
            className={cn(
              'h-9 px-3.5 rounded-full text-[12.5px] font-semibold border transition-colors',
              filters.incomplete ? 'bg-warning/10 border-warning/30 text-warning' : 'border-line text-ink-soft hover:border-line-strong',
            )}
          >
            À compléter uniquement
          </button>
          {activeCount > 0 && (
            <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true })} className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted hover:text-ink">
              <X size={14} /> Effacer les filtres
            </button>
          )}
        </div>
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
      </div>

      {/* Totals */}
      {data?.totals.map((t) => (
        <div key={t.currency} className={cn('grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 transition-opacity', isFetching && 'opacity-60')}>
          {[
            ['Facturé aux clients', t.billed, true],
            ['Coût des prestataires', t.cost],
            ['Marge brute', t.margin],
            ['Part des propriétaires', t.ownerShare],
            ['Part des salariés', t.sellerShare],
            ['Net Malodge', t.net, true],
          ].map(([label, value, strong]) => (
            <div key={label as string} className={cn('rounded-2xl px-4 py-3.5', strong ? 'bg-peach' : 'bg-surface border border-line')}>
              <p className="text-[12px] text-muted">{label}</p>
              <Money value={value as number} currency={t.currency} className="block text-[18px] font-bold text-ink mt-1" />
            </div>
          ))}
        </div>
      ))}
      <p className="text-[12.5px] text-muted -mt-2">
        {lines.length} extra{lines.length > 1 ? 's' : ''} affiché{lines.length > 1 ? 's' : ''}
        {data?.totals[0]?.incomplete ? `, dont ${data.totals.reduce((s, t) => s + t.incomplete, 0)} à compléter (montants partiels)` : ''}.
      </p>

      {/* Table */}
      {isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : lines.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState title="Aucun extra pour ces filtres" hint="Modifiez les filtres ou ajoutez un extra." />
        </div>
      ) : (
        <TableCard>
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Client / séjour</th>
                <th className={th}>Prestation</th>
                <th className={cn(th, 'text-right')}>Qté</th>
                <th className={cn(th, 'text-right')}>Total client</th>
                <th className={cn(th, 'text-right')}>Coût</th>
                <th className={cn(th, 'text-right')}>Marge</th>
                <th className={cn(th, 'text-right')}>Propriétaire</th>
                <th className={cn(th, 'text-right')}>Salarié</th>
                <th className={cn(th, 'text-right')}>Net Malodge</th>
                <th className={th}>Statut</th>
                <th className={th} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => (
                <tr key={l.id} className={cn('hover:bg-surface-2/50 transition-colors', l.cancelled && 'opacity-55')}>
                  <td className={cn(td, 'whitespace-nowrap text-ink-soft tabular')}>{l.date ? formatDate(l.date) : <IssueTag issue="Sans date" />}</td>
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
                    {l.issue && (
                      <div className="mt-1">
                        <IssueTag issue={l.issue} />
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
                  <td className={cn(td, 'text-right text-ink-soft')} title={l.owner ? `${l.owner.name} · ${pct(l.ownerRate)}` : 'Pas de propriétaire'}>
                    <Money value={l.ownerShare} currency={l.currency} />
                  </td>
                  <td className={cn(td, 'text-right text-ink-soft')} title={l.seller ? `${l.seller.name} · ${pct(l.sellerRate)}` : 'Pas de vendeur'}>
                    <Money value={l.sellerShare} currency={l.currency} />
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
      )}

      <ExtraFormModal open={!!editing} onClose={() => setEditing(null)} options={options} extra={editing} />
    </div>
  );
}
