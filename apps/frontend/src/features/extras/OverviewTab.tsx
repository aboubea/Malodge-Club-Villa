import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Briefcase, Home, Landmark, UserRound, Users, Wallet } from 'lucide-react';
import { Skeleton } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';
import { formatDate, formatMoney } from '../../lib/utils';
import { Account, Options, STATE_BADGE, useExtrasSummary } from './api';
import { EmptyState, Field, Money, StatTile, TextInput } from './ui';

function TopList({ title, accounts, to, columns }: { title: string; accounts: Account[]; to: string; columns: 'client' | 'payee' }) {
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <p className="text-[14px] font-bold text-ink">{title}</p>
        <Link to={to} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:text-accent-hover">
          Comptes <ArrowRight size={13} />
        </Link>
      </div>
      {accounts.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted">Aucun compte.</p>
      ) : (
        <ul className="divide-y divide-line">
          {accounts.map((a) => (
            <li key={`${a.id}-${a.currency}`} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink truncate">
                  {a.name}
                  {a.incompleteCount > 0 && <span className="text-warning" title={`${a.incompleteCount} extra(s) à compléter`}> *</span>}
                </p>
                <p className="text-[12px] text-muted truncate">
                  {columns === 'client'
                    ? `${a.meta?.villa ?? ''} · facturé ${formatMoney(a.due, a.currency)}`
                    : `${a.role === 'PROVIDER' ? 'Coûts' : 'Cagnotte'} ${formatMoney(a.due, a.currency)} · versé ${formatMoney(a.paid, a.currency)}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <Money value={a.balance} currency={a.currency} className="text-[13.5px] font-bold" />
                <div className="mt-0.5">
                  <Badge variant={STATE_BADGE[a.state]} dot={false}>
                    {a.state}
                  </Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ShareSimulator({ options }: { options: Options | undefined }) {
  const [sale, setSale] = useState('1000');
  const [cost, setCost] = useState('600');
  const [owner, setOwner] = useState('50');
  const [employee, setEmployee] = useState('10');
  const n = (v: string) => Number(v.replace(',', '.')) || 0;
  const r = useMemo(() => {
    const margin = n(sale) - n(cost);
    const ownerShare = margin * (n(owner) / 100);
    const malodge = margin - ownerShare;
    const employeeShare = malodge * (n(employee) / 100);
    return { margin, ownerShare, employeeShare, net: malodge - employeeShare };
  }, [sale, cost, owner, employee]);
  const currency = options?.villas[0]?.currency ?? 'MAD';

  return (
    <div className="rounded-2xl bg-peach p-5 sm:p-6">
      <p className="text-[15px] font-bold text-ink">Simuler un partage</p>
      <p className="text-[12.5px] text-ink-soft mt-0.5">Le salarié touche un pourcentage de la part Malodge, après le propriétaire.</p>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <Field label={`Vente (${currency})`}>
          <TextInput inputMode="decimal" value={sale} onChange={(e) => setSale(e.target.value)} />
        </Field>
        <Field label={`Coût prestataire (${currency})`}>
          <TextInput inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="Propriétaire (%)">
          <TextInput inputMode="decimal" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </Field>
        <Field label="Salarié sur part Malodge (%)">
          <TextInput inputMode="decimal" value={employee} onChange={(e) => setEmployee(e.target.value)} />
        </Field>
      </div>
      <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Marge brute', r.margin],
          ['Part propriétaire', r.ownerShare],
          ['Part salarié', r.employeeShare],
          ['Net Malodge', r.net],
        ].map(([label, v], i) => (
          <div key={label as string} className={i === 3 ? 'rounded-xl bg-primary text-on-primary p-3' : 'rounded-xl bg-surface/70 p-3'}>
            <dt className={i === 3 ? 'text-[12px] text-on-primary/70' : 'text-[12px] text-muted'}>{label}</dt>
            <dd className="text-[16px] font-bold tabular mt-0.5">{formatMoney(v as number, currency)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function OverviewTab({ options }: { options: Options | undefined }) {
  const { data, isLoading } = useExtrasSummary();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[112px] rounded-2xl" />
        ))}
      </div>
    );
  }

  const { alerts } = data;
  const hasAlerts = alerts.incompleteExtras + alerts.pendingSettlements + alerts.settingsToCheck > 0;

  return (
    <div className="space-y-6">
      {data.currencies.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState title="Aucun extra pour le moment" hint="Ajoutez un premier extra, ou importez votre fichier Excel de suivi." />
        </div>
      )}

      {data.currencies.map((c) => (
        <section key={c.currency} className="space-y-3">
          {data.currencies.length > 1 && <p className="text-[13px] font-bold text-ink">Montants en {c.currency}</p>}
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatTile tone="peach" label="Clients actifs à encaisser" value={formatMoney(c.clientsToCollect, c.currency)} icon={Users}
              hint={c.archivedToCollect > 0 ? `+ ${formatMoney(c.archivedToCollect, c.currency)} sur séjours archivés` : undefined} />
            <StatTile label="À payer aux prestataires" value={formatMoney(c.providersToPay, c.currency)} icon={Briefcase} />
            <StatTile label="Marge nette des séjours actifs" value={formatMoney(c.activeNet, c.currency)} icon={Wallet} />
            <StatTile label="À verser aux propriétaires" value={formatMoney(c.ownersToPay, c.currency)} icon={Home} />
            <StatTile label="À verser aux salariés" value={formatMoney(c.employeesToPay, c.currency)} icon={UserRound} />
            <StatTile label="Trésorerie enregistrée" value={formatMoney(c.treasury, c.currency)} icon={Landmark} hint="Règlements validés" />
          </div>
        </section>
      ))}

      {hasAlerts && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-warning/25 bg-warning/5 px-5 py-4 text-[13px]">
          <span className="inline-flex items-center gap-2 font-bold text-ink">
            <AlertTriangle size={16} className="text-warning" /> À traiter
          </span>
          {alerts.incompleteExtras > 0 && (
            <Link to="/extras/saisie?incomplete=true" className="text-ink-soft hover:text-ink underline-offset-2 hover:underline">
              {alerts.incompleteExtras} extra{alerts.incompleteExtras > 1 ? 's' : ''} à compléter
            </Link>
          )}
          {alerts.pendingSettlements > 0 && (
            <Link to="/extras/reglements?status=PENDING" className="text-ink-soft hover:text-ink underline-offset-2 hover:underline">
              {alerts.pendingSettlements} règlement{alerts.pendingSettlements > 1 ? 's' : ''} à valider
            </Link>
          )}
          {alerts.settingsToCheck > 0 && (
            <Link to="/extras/reglages" className="text-ink-soft hover:text-ink underline-offset-2 hover:underline">
              {alerts.settingsToCheck} taux à renseigner
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TopList title="Clients actifs — principaux soldes" accounts={data.topClients} to="/extras/comptes?role=CLIENT" columns="client" />
        <TopList title="Prestataires — principaux soldes" accounts={data.topProviders} to="/extras/comptes?role=PROVIDER" columns="payee" />
        <TopList title="Propriétaires — cagnottes" accounts={data.topOwners} to="/extras/comptes?role=OWNER" columns="payee" />
        <TopList title="Salariés — cagnottes" accounts={data.topEmployees} to="/extras/comptes?role=EMPLOYEE" columns="payee" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-line bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <p className="text-[14px] font-bold text-ink">Derniers règlements</p>
            <Link to="/extras/reglements" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:text-accent-hover">
              Historique <ArrowRight size={13} />
            </Link>
          </div>
          {data.recentSettlements.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Les règlements saisis apparaîtront ici.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recentSettlements.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-ink truncate">{s.stay?.label ?? s.person.name}</p>
                    <p className="text-[12px] text-muted">
                      {s.kindLabel} · {s.date ? formatDate(s.date) : 'sans date'}
                    </p>
                  </div>
                  <div className="text-right">
                    <Money value={s.amount} currency={s.currency} className="text-[13.5px] font-bold" />
                    {s.status !== 'VALIDATED' && (
                      <p className="text-[11.5px] font-semibold text-warning">{s.status === 'PENDING' ? 'À valider' : 'Annulé'}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ShareSimulator options={options} />
      </div>
    </div>
  );
}
