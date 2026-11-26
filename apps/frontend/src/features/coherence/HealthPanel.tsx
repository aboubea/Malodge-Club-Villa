import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, KeyRound, Mail, Plug, ServerCrash, ShieldAlert, TriangleAlert } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn } from '../../lib/utils';

type Kind = 'api' | 'lodgify' | 'mail';
interface Overview {
  incidents: { id: string; kind: Kind; message: string; route: string | null; status: number | null; count: number; firstSeen: string; lastSeen: string }[];
  checks: { jwtSecret: 'configured' | 'derived'; jwtRefreshSecret: 'configured' | 'derived'; mailConfigured: boolean; mailSenderIsDefault: boolean; alertRecipients: string };
  logins: { loginFailures24h: number; lockedAccounts: string[] };
}

const KIND: Record<Kind, { icon: React.ElementType; label: string }> = {
  api: { icon: ServerCrash, label: 'Erreur serveur' },
  lodgify: { icon: Plug, label: 'Lodgify' },
  mail: { icon: Mail, label: 'E-mail non envoyé' },
};

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 48 * 60) return `il y a ${Math.round(min / 60)} h`;
  return `il y a ${Math.round(min / 1440)} j`;
};

function Check({ ok, icon: Icon, children }: { ok: boolean; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px]', ok ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
      <Icon size={15} className="shrink-0 mt-0.5" />
      <p className="text-ink-soft">{children}</p>
    </div>
  );
}

/** Errors of the last days (server, Lodgify, e-mails), login failures and security settings. */
export function HealthPanel() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['monitoring'],
    queryFn: async () => {
      const r = await apiClient.get('/monitoring');
      return (r.data?.data ?? r.data) as Overview;
    },
    refetchInterval: 60_000,
  });
  if (!data) return null;
  const { incidents, checks, logins } = data;
  const shown = open ? incidents : incidents.slice(0, 5);
  const secretsOk = checks.jwtSecret === 'configured' && checks.jwtRefreshSecret === 'configured';

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold text-ink">Santé de l’application</h2>
        <span className="text-[12px] text-muted">Alertes par e-mail : {checks.alertRecipients === 'ALERT_EMAIL' ? 'adresse ALERT_EMAIL' : 'administrateurs'}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Check ok={secretsOk} icon={KeyRound}>
          {secretsOk ? (
            <>Clés de session configurées.</>
          ) : (
            <>
              <b>JWT_SECRET / JWT_REFRESH_SECRET absentes</b> : une clé de secours est utilisée. Définissez-les dans Vercel (longues et aléatoires).
            </>
          )}
        </Check>
        <Check ok={checks.mailConfigured && !checks.mailSenderIsDefault} icon={Mail}>
          {!checks.mailConfigured ? <b>RESEND_API_KEY absente : aucun e-mail ne part.</b> : checks.mailSenderIsDefault ? <>Expéditeur de test Resend : renseignez MAIL_FROM.</> : <>E-mails configurés.</>}
        </Check>
        <Check ok={logins.lockedAccounts.length === 0} icon={ShieldAlert}>
          {logins.loginFailures24h} échec{logins.loginFailures24h > 1 ? 's' : ''} de connexion en 24 h
          {logins.lockedAccounts.length > 0 && (
            <>
              {' '}
              · bloqué 15 min : <b>{logins.lockedAccounts.join(', ')}</b>
            </>
          )}
        </Check>
      </div>

      {incidents.length === 0 ? (
        <p className="flex items-center gap-2 text-[13px] font-semibold text-success">
          <CheckCircle2 size={16} /> Aucun incident sur les 14 derniers jours.
        </p>
      ) : (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">Incidents (14 jours)</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {shown.map((i) => {
              const K = KIND[i.kind] ?? { icon: TriangleAlert, label: i.kind };
              return (
                <li key={i.id} className="flex gap-3 px-3 py-2.5">
                  <K.icon size={16} className="shrink-0 mt-0.5 text-danger" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink break-words">{i.message}</p>
                    <p className="text-[11.5px] text-muted mt-0.5">
                      {K.label}
                      {i.route ? ` · ${i.route}` : ''} · {ago(i.lastSeen)}
                    </p>
                  </div>
                  {i.count > 1 && <span className="shrink-0 h-6 px-2 rounded-full bg-danger/10 text-danger text-[12px] font-semibold inline-flex items-center">× {i.count}</span>}
                </li>
              );
            })}
          </ul>
          {incidents.length > 5 && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-[12.5px] font-semibold text-accent hover:underline">
              {open ? 'Voir moins' : `Voir les ${incidents.length - 5} autres`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
