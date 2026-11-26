import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { cn, formatDate, formatMoney } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { AccountState, ExtraStatus, METHOD_LABELS, STATE_BADGE, STATUS_BADGE, STATUS_LABELS, pct } from './api';
import { EmptyState, Money, TableCard, td, th } from './ui';

interface MyLine {
  id: string;
  date: string | null;
  label: string;
  status: ExtraStatus;
  currency: string;
  villa: string | null;
  stay: string | null;
  quantity: number | null;
  unitPrice?: number | null;
  billed?: number | null;
  margin?: number | null;
  base?: number | null;
  rate?: number | null;
  amount: number | null;
}

interface MyAccount {
  role: 'CLIENT' | 'PROVIDER' | 'OWNER' | 'EMPLOYEE';
  accounts: { id: string; name: string; currency: string; due: number; paid: number; balance: number; state: AccountState; extrasCount: number; incompleteCount: number }[];
  lines: MyLine[];
  settlements: { id: string; kindLabel: string; status: 'PENDING' | 'VALIDATED'; date: string | null; amount: number; currency: string; method: string | null; stay: string | null }[];
}

const COPY = {
  CLIENT: { title: 'Mes extras', description: 'Les prestations commandées pendant vos séjours et votre solde.', due: 'Total des extras', paid: 'Déjà réglé', balance: 'Reste à régler', amount: 'Montant' },
  PROVIDER: { title: 'Mon compte prestataire', description: 'Vos prestations réalisées pour Malodge et les paiements reçus.', due: 'Prestations dues', paid: 'Déjà payé', balance: 'Reste à recevoir', amount: 'Montant dû' },
  OWNER: { title: 'Ma cagnotte', description: 'Les commissions générées par les extras de vos villas.', due: 'Cagnotte générée', paid: 'Déjà versé', balance: 'Reste à recevoir', amount: 'Ma commission' },
  EMPLOYEE: { title: 'Mes commissions', description: 'Les commissions sur les extras que vous avez vendus.', due: 'Commissions générées', paid: 'Déjà versé', balance: 'Reste à recevoir', amount: 'Ma commission' },
} as const;

export function MyAccountPage() {
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ['extras', 'me'],
    queryFn: async () => {
      const r = await apiClient.get('/extras/me');
      return (r.data?.data ?? r.data) as MyAccount;
    },
  });
  const role = (data?.role ?? user?.role ?? 'CLIENT') as keyof typeof COPY;
  const copy = COPY[role] ?? COPY.CLIENT;

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      {isLoading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {data.accounts.length === 0 && (
            <div className="rounded-2xl border border-line bg-surface">
              <EmptyState title="Rien pour le moment" hint="Vos extras et règlements apparaîtront ici." />
            </div>
          )}
          {data.accounts.map((a) => (
            <div key={`${a.id}-${a.currency}`} className="space-y-2">
              {role === 'CLIENT' && <p className="text-[13px] font-bold text-ink">{a.name}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-line bg-surface p-5">
                  <p className="text-[13px] text-muted">{copy.due}</p>
                  <p className="text-[24px] font-bold tabular mt-2">{formatMoney(a.due, a.currency)}</p>
                </div>
                <div className="rounded-2xl border border-line bg-surface p-5">
                  <p className="text-[13px] text-muted">{copy.paid}</p>
                  <p className="text-[24px] font-bold tabular mt-2">{formatMoney(a.paid, a.currency)}</p>
                </div>
                <div className="rounded-2xl bg-peach p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] text-ink-soft">{copy.balance}</p>
                    <Badge variant={STATE_BADGE[a.state]}>{a.state}</Badge>
                  </div>
                  <p className="text-[24px] font-bold tabular mt-2">{formatMoney(Math.max(0, a.balance), a.currency)}</p>
                </div>
              </div>
              {a.incompleteCount > 0 && (
                <p className="text-[12.5px] text-muted">
                  {a.incompleteCount} prestation{a.incompleteCount > 1 ? 's' : ''} en cours de finalisation : le montant peut encore évoluer.
                </p>
              )}
            </div>
          ))}

          {data.lines.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[16px] font-bold text-ink">Détail des prestations</h2>
              <TableCard>
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr>
                      <th className={th}>Date</th>
                      <th className={th}>Prestation</th>
                      {role !== 'CLIENT' && <th className={th}>{role === 'PROVIDER' || role === 'EMPLOYEE' ? 'Séjour' : 'Villa / séjour'}</th>}
                      <th className={cn(th, 'text-right')}>Qté</th>
                      {role === 'OWNER' && <th className={cn(th, 'text-right')}>Marge</th>}
                      {role === 'EMPLOYEE' && <th className={cn(th, 'text-right')}>Base</th>}
                      {(role === 'OWNER' || role === 'EMPLOYEE') && <th className={cn(th, 'text-right')}>Taux</th>}
                      <th className={cn(th, 'text-right')}>{copy.amount}</th>
                      <th className={th}>Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.lines.map((l) => (
                      <tr key={l.id} className={l.status === 'CANCELLED' ? 'opacity-55' : undefined}>
                        <td className={cn(td, 'tabular text-ink-soft whitespace-nowrap')}>{l.date ? formatDate(l.date) : '—'}</td>
                        <td className={td}>
                          <p className="max-w-[320px] truncate" title={l.label}>
                            {l.label}
                          </p>
                          {role === 'CLIENT' && <p className="text-[12px] text-muted">{l.villa}</p>}
                        </td>
                        {role !== 'CLIENT' && (
                          <td className={cn(td, 'text-ink-soft')}>{role === 'OWNER' ? [l.villa, l.stay].filter(Boolean).join(' · ') : l.stay}</td>
                        )}
                        <td className={cn(td, 'text-right tabular')}>{l.quantity ?? '—'}</td>
                        {role === 'OWNER' && (
                          <td className={cn(td, 'text-right text-ink-soft')}>
                            <Money value={l.margin} currency={l.currency} />
                          </td>
                        )}
                        {role === 'EMPLOYEE' && (
                          <td className={cn(td, 'text-right text-ink-soft')}>
                            <Money value={l.base} currency={l.currency} />
                          </td>
                        )}
                        {(role === 'OWNER' || role === 'EMPLOYEE') && <td className={cn(td, 'text-right text-ink-soft whitespace-nowrap')}>{pct(l.rate)}</td>}
                        <td className={cn(td, 'text-right font-semibold')}>
                          <Money value={l.amount} currency={l.currency} />
                        </td>
                        <td className={td}>
                          <Badge variant={STATUS_BADGE[l.status]}>{STATUS_LABELS[l.status]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </section>
          )}

          {data.settlements.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[16px] font-bold text-ink">Règlements</h2>
              <TableCard>
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <th className={th}>Date</th>
                      <th className={th}>Opération</th>
                      <th className={th}>Mode</th>
                      <th className={cn(th, 'text-right')}>Montant</th>
                      <th className={th}>Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.settlements.map((s) => (
                      <tr key={s.id}>
                        <td className={cn(td, 'tabular text-ink-soft')}>{s.date ? formatDate(s.date) : '—'}</td>
                        <td className={td}>
                          {s.kindLabel}
                          {s.stay && <span className="text-muted"> · {s.stay}</span>}
                        </td>
                        <td className={cn(td, 'text-ink-soft')}>{s.method ? METHOD_LABELS[s.method] : '—'}</td>
                        <td className={cn(td, 'text-right font-semibold')}>
                          <Money value={s.amount} currency={s.currency} />
                        </td>
                        <td className={td}>
                          <Badge variant={s.status === 'VALIDATED' ? 'success' : 'pending'}>{s.status === 'VALIDATED' ? 'Validé' : 'En cours de validation'}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </section>
          )}
        </>
      )}
    </div>
  );
}
