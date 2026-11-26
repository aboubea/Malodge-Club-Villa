import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn, formatDay, formatMoney } from '../../lib/utils';
import { Account, AccountRole, AccountState, Options, ROLE_LABELS, STATE_BADGE, pct, useAccounts } from './api';
import { SettlementFormModal, SettlementPreset } from './forms';
import { EmptyState, Money, Segmented, Select, TableCard, td, th } from './ui';

const PAY_KIND: Record<AccountRole, string> = {
  CLIENT: 'CLIENT_PAYMENT',
  PROVIDER: 'PROVIDER_PAYMENT',
  OWNER: 'OWNER_PAYOUT',
  EMPLOYEE: 'EMPLOYEE_PAYOUT',
};

const DUE_LABEL: Record<AccountRole, string> = {
  CLIENT: 'Facturé',
  PROVIDER: 'Coûts générés',
  OWNER: 'Cagnotte générée',
  EMPLOYEE: 'Commissions générées',
};

const STATES: AccountState[] = ['Non réglé', 'Partiel', 'Réglé', 'Avance', 'Rien à régler', 'À compléter'];

export function AccountsTab({ options }: { options: Options | undefined }) {
  const [params, setParams] = useSearchParams();
  const role = (params.get('role') as AccountRole) || 'CLIENT';
  const [state, setState] = useState<string>('');
  const [stays, setStays] = useState<'active' | 'archived' | 'all'>('active');
  const [sort, setSort] = useState<'balance' | 'name'>('balance');
  const [preset, setPreset] = useState<SettlementPreset | null>(null);
  const { data, isLoading } = useAccounts(role);

  const rows = useMemo(() => {
    let list = (data ?? []).filter((a) => !state || a.state === state);
    if (role === 'CLIENT') list = list.filter((a) => (stays === 'all' ? true : stays === 'archived' ? a.archived : !a.archived));
    return [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.balance - a.balance));
  }, [data, state, stays, sort, role]);

  const totals = useMemo(() => {
    const map = new Map<string, { due: number; paid: number; balance: number }>();
    for (const a of rows) {
      const t = map.get(a.currency) ?? { due: 0, paid: 0, balance: 0 };
      t.due += a.due;
      t.paid += a.paid;
      t.balance += Math.max(0, a.balance);
      map.set(a.currency, t);
    }
    return [...map.entries()];
  }, [rows]);

  const setRole = (r: AccountRole) => {
    const next = new URLSearchParams(params);
    next.set('role', r);
    setParams(next, { replace: true });
    setState('');
  };

  const detail = (a: Account) => {
    if (role === 'CLIENT') {
      const dates = a.meta?.checkIn
        ? `${formatDay(a.meta.checkIn)} → ${formatDay(a.meta.checkOut)}${a.meta.datesEstimated ? ' (dates à confirmer)' : ''}`
        : null;
      return [a.meta?.villa, dates].filter(Boolean).join(' · ');
    }
    if (role === 'OWNER') return [a.meta?.villas?.join(' · ') || 'Aucune villa', a.meta?.rate != null ? `${pct(a.meta.rate)} de la marge` : 'Taux à renseigner'].join(' · ');
    if (role === 'EMPLOYEE')
      return a.meta?.rate != null
        ? `${pct(a.meta.rate)} ${a.meta.base === 'TOTAL_MARGIN' ? 'de la marge totale' : 'de la part Malodge'}`
        : 'Taux à renseigner';
    return [a.meta?.contact, a.lastSettlement ? `dernier règlement le ${formatDay(a.lastSettlement)}` : null].filter(Boolean).join(' · ') || '—';
  };

  const filterKey = role === 'CLIENT' ? 'stayId' : role === 'PROVIDER' ? 'providerId' : role === 'OWNER' ? 'ownerId' : 'sellerId';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={role}
          onChange={setRole}
          options={(Object.keys(ROLE_LABELS) as AccountRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r].many }))}
        />
        {role === 'CLIENT' && (
          <Select value={stays} onChange={(e) => setStays(e.target.value as typeof stays)} className="w-40" aria-label="Séjours">
            <option value="active">Séjours actifs</option>
            <option value="archived">Archivés</option>
            <option value="all">Tous</option>
          </Select>
        )}
        <Select value={state} onChange={(e) => setState(e.target.value)} className="w-44" aria-label="État du compte">
          <option value="">Tous les états</option>
          {STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as 'balance' | 'name')} className="w-44" aria-label="Tri">
          <option value="balance">Solde décroissant</option>
          <option value="name">Nom A → Z</option>
        </Select>
      </div>

      {totals.map(([currency, t]) => (
        <div key={currency} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-surface border border-line px-4 py-3.5">
            <p className="text-[12px] text-muted">{DUE_LABEL[role]}</p>
            <p className="text-[18px] font-bold mt-1 tabular">{formatMoney(t.due, currency)}</p>
          </div>
          <div className="rounded-2xl bg-surface border border-line px-4 py-3.5">
            <p className="text-[12px] text-muted">{role === 'CLIENT' ? 'Reçu net validé' : 'Déjà versé net'}</p>
            <p className="text-[18px] font-bold mt-1 tabular">{formatMoney(t.paid, currency)}</p>
          </div>
          <div className="rounded-2xl bg-peach px-4 py-3.5">
            <p className="text-[12px] text-muted">{role === 'CLIENT' ? 'Reste à encaisser' : 'Reste à verser'}</p>
            <p className="text-[18px] font-bold mt-1 tabular">{formatMoney(t.balance, currency)}</p>
          </div>
        </div>
      ))}

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState title="Aucun compte" hint="Les comptes apparaissent dès qu’une personne ou un séjour a des extras." />
        </div>
      ) : (
        <TableCard>
          <table className="w-full min-w-[880px]">
            <thead>
              <tr>
                <th className={th}>{ROLE_LABELS[role].one}</th>
                <th className={cn(th, 'text-right')}>{DUE_LABEL[role]}</th>
                <th className={cn(th, 'text-right')}>{role === 'CLIENT' ? 'Reçu net' : 'Versé net'}</th>
                <th className={cn(th, 'text-right')}>Solde</th>
                <th className={th}>État</th>
                <th className={cn(th, 'text-right')}>Extras</th>
                <th className={th} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a) => (
                <tr key={`${a.id}-${a.currency}`} className="hover:bg-surface-2/50">
                  <td className={td}>
                    <Link to={`/extras/saisie?${filterKey}=${a.id}&stays=all`} className="font-semibold hover:underline">
                      {a.name}
                    </Link>
                    {a.archived && <span className="ml-2 text-[11.5px] text-muted">archivé</span>}
                    <p className="text-[12px] text-muted truncate max-w-[340px]">{detail(a)}</p>
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <Money value={a.due} currency={a.currency} />
                  </td>
                  <td className={cn(td, 'text-right text-ink-soft')}>
                    <Money value={a.paid} currency={a.currency} />
                  </td>
                  <td className={cn(td, 'text-right font-bold')}>
                    <Money value={a.balance} currency={a.currency} />
                  </td>
                  <td className={td}>
                    <Badge variant={STATE_BADGE[a.state]}>{a.state}</Badge>
                  </td>
                  <td className={cn(td, 'text-right tabular text-ink-soft')}>
                    {a.extrasCount}
                    {a.incompleteCount > 0 && <span className="block text-[11.5px] font-semibold text-warning">{a.incompleteCount} à compléter</span>}
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Wallet size={13} />}
                      onClick={() => setPreset({ kind: PAY_KIND[role], accountId: a.id, currency: a.currency })}
                    >
                      Saisir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      <SettlementFormModal open={!!preset} onClose={() => setPreset(null)} options={options} preset={preset} />
    </div>
  );
}
