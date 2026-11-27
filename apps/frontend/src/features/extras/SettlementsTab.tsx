import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, RotateCcw, Plus, X } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuthStore } from '../../store/authStore';
import { cn, formatDay } from '../../lib/utils';
import { METHOD_LABELS, Options, ROLE_LABELS, SETTLEMENT_STATUS_LABELS, Settlement, api, useExtrasMutation, useSettlements } from './api';
import { SettlementFormModal } from './forms';
import { EmptyState, Money, Segmented, Select, TableCard, TextInput, td, th } from './ui';
import { mergeInDisplay } from '../../lib/display';
import { useUIStore } from '../../store/uiStore';
import { ColSpec, ColumnHeader, TableFilterSummary, useTableControls } from '../../components/ui/tableControls';

const STATUS_VARIANT = { PENDING: 'pending', VALIDATED: 'success', CANCELLED: 'cancelled' } as const;

/** What each column sorts and filters on: the value shown in it. */
const SETTLEMENT_COLS: ColSpec<Settlement>[] = [
  { key: 'date', label: 'Date', kind: 'date', value: (s) => s.date },
  { key: 'person', label: 'Personne', value: (s) => s.stay?.label ?? s.person.name },
  { key: 'kind', label: 'Opération', value: (s) => s.kindLabel },
  { key: 'amount', label: 'Montant', kind: 'number', align: 'right', value: (s) => s.amount },
  { key: 'method', label: 'Mode', value: (s) => (s.method ? METHOD_LABELS[s.method] : null) },
  { key: 'status', label: 'Statut', value: (s) => SETTLEMENT_STATUS_LABELS[s.status] },
  { key: 'treasury', label: 'Trésorerie', kind: 'number', align: 'right', value: (s) => (s.status === 'VALIDATED' ? s.treasury : null) },
];

type SettlementTotals = { currency: string; inflow: number; outflow: number; net: number; pending: number };

/** The totals of the settlements shown (same rules as the server): the column filters update them. */
function totalsOf(rows: Settlement[]): SettlementTotals[] {
  const map = new Map<string, SettlementTotals>();
  for (const s of rows) {
    const t = map.get(s.currency) ?? { currency: s.currency, inflow: 0, outflow: 0, net: 0, pending: 0 };
    if (s.status === 'PENDING') t.pending += 1;
    if (s.treasury > 0) t.inflow += s.treasury;
    if (s.treasury < 0) t.outflow += -s.treasury;
    t.net += s.treasury;
    map.set(s.currency, t);
  }
  return [...map.values()];
}

export function SettlementsTab({ options }: { options: Options | undefined }) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const [params, setParams] = useSearchParams();
  useUIStore((s) => s.currency); // totals follow the MAD / € switch
  const filters = {
    role: params.get('role') ?? '',
    status: params.get('status') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };
  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useSettlements(filters);
  const action = useExtrasMutation(api.settlementAction);

  const rows = [...(data?.settlements ?? [])].sort((a, b) => {
    // Rows without a date go last, as in the spreadsheet.
    if (!a.date) return 1;
    if (!b.date) return -1;
    return order === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  // Sort and filter at the top of the columns (as in the Excel file); the totals follow what is shown.
  const ctl = useTableControls<Settlement>('extras-settlements', rows, SETTLEMENT_COLS);
  const totals = ctl.activeCount ? totalsOf(ctl.rows) : data?.totals ?? [];

  const act = (s: Settlement, a: 'validate' | 'cancel' | 'reopen') => action.mutate({ id: s.id, action: a });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={filters.status}
          onChange={(v) => setFilter('status', v)}
          options={[
            { value: '', label: 'Tous' },
            { value: 'PENDING', label: 'À valider', count: data?.totals.reduce((s, t) => s + t.pending, 0) },
            { value: 'VALIDATED', label: 'Validés' },
            { value: 'CANCELLED', label: 'Annulés' },
          ]}
        />
        <Select value={filters.role} onChange={(e) => setFilter('role', e.target.value)} className="w-44" aria-label="Catégorie">
          <option value="">Toutes catégories</option>
          {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r].many}
            </option>
          ))}
        </Select>
        <TextInput type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className="w-40" aria-label="Du" title="Du (inclus)" />
        <TextInput type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className="w-40" aria-label="Au" title="Au (inclus)" />
        <Select value={order} onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')} className="w-52" aria-label="Tri">
          <option value="desc">Plus récents d’abord</option>
          <option value="asc">Plus anciens d’abord</option>
        </Select>
        <Button className="ml-auto" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
          Ajouter un règlement
        </Button>
      </div>

      {mergeInDisplay(totals, (t) => t.currency, ['inflow', 'outflow', 'net', 'pending'] as const).map(({ row: t, currency }) => (
        <div key={currency} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-surface border border-line px-4 py-3.5">
            <p className="text-[12px] text-muted">Encaissements validés</p>
            <Money value={t.inflow} currency={currency} className="block text-[18px] font-bold mt-1 text-success" />
          </div>
          <div className="rounded-2xl bg-surface border border-line px-4 py-3.5">
            <p className="text-[12px] text-muted">Décaissements validés</p>
            <Money value={t.outflow} currency={currency} className="block text-[18px] font-bold mt-1" />
          </div>
          <div className="rounded-2xl bg-peach px-4 py-3.5">
            <p className="text-[12px] text-muted">Trésorerie nette</p>
            <Money value={t.net} currency={currency} className="block text-[18px] font-bold mt-1" />
          </div>
        </div>
      ))}

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState title="Aucun règlement" hint="Les encaissements clients et les versements apparaîtront ici." />
        </div>
      ) : (
        <>
        <TableFilterSummary ctl={ctl} noun="règlement" />
        <TableCard>
          <table className="w-full min-w-[960px]">
            <thead>
              <tr>
                <th className={th}><ColumnHeader ctl={ctl} col="date" /></th>
                <th className={th}><ColumnHeader ctl={ctl} col="person" /></th>
                <th className={th}><ColumnHeader ctl={ctl} col="kind" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="amount" /></th>
                <th className={th}><ColumnHeader ctl={ctl} col="method" /></th>
                <th className={th}><ColumnHeader ctl={ctl} col="status" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="treasury" /></th>
                <th className={th} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ctl.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className={cn(td, 'text-center text-muted')}>
                    Aucun règlement ne correspond aux filtres.
                  </td>
                </tr>
              )}
              {ctl.rows.map((s) => (
                <tr key={s.id} className={cn('hover:bg-surface-2/50', s.status === 'CANCELLED' && 'opacity-55')}>
                  <td className={cn(td, 'whitespace-nowrap tabular text-ink-soft')}>{s.date ? formatDay(s.date) : <span className="text-warning font-semibold">Sans date</span>}</td>
                  <td className={td}>
                    <p className="font-semibold">{s.stay?.label ?? s.person.name}</p>
                    <p className="text-[12px] text-muted">
                      {ROLE_LABELS[s.role].one}
                      {s.stay ? ` · ${s.stay.villa}` : ''}
                    </p>
                  </td>
                  <td className={td}>
                    <p>{s.kindLabel}</p>
                    {(s.reference || s.note) && <p className="text-[12px] text-muted truncate max-w-[260px]">{[s.reference, s.note].filter(Boolean).join(' · ')}</p>}
                  </td>
                  <td className={cn(td, 'text-right font-semibold')}>
                    <Money value={s.amount} currency={s.currency} />
                  </td>
                  <td className={cn(td, 'text-ink-soft')}>{s.method ? METHOD_LABELS[s.method] : '—'}</td>
                  <td className={td}>
                    <Badge variant={STATUS_VARIANT[s.status]}>{SETTLEMENT_STATUS_LABELS[s.status]}</Badge>
                    {s.validatedBy && <p className="text-[11.5px] text-muted mt-1">par {s.validatedBy}</p>}
                  </td>
                  <td className={cn(td, 'text-right')}>
                    {s.status === 'VALIDATED' ? (
                      <Money value={s.treasury} currency={s.currency} signed className={s.treasury >= 0 ? 'text-success' : 'text-ink-soft'} />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className={cn(td, 'text-right whitespace-nowrap')}>
                    {isAdmin && s.status === 'PENDING' && (
                      <>
                        <Button size="sm" icon={<Check size={13} />} onClick={() => act(s, 'validate')} disabled={!s.date} title={s.date ? 'Valider' : 'Renseignez une date pour valider'}>
                          Valider
                        </Button>
                        <button type="button" onClick={() => act(s, 'cancel')} className="ml-1 w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10" aria-label="Annuler le règlement" title="Annuler">
                          <X size={15} />
                        </button>
                      </>
                    )}
                    {isAdmin && s.status !== 'PENDING' && (
                      <button type="button" onClick={() => act(s, 'reopen')} className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2" aria-label="Repasser à valider" title="Repasser « à valider »">
                        <RotateCcw size={14} />
                      </button>
                    )}
                    {!isAdmin && s.status === 'PENDING' && <span className="text-[12px] text-muted">En attente d’un admin</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
        </>
      )}

      <SettlementFormModal open={creating} onClose={() => setCreating(false)} options={options} />
    </div>
  );
}
