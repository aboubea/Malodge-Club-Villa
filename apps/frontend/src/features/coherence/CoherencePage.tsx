import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, ArrowUpRight, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { FileCheck } from './FileCheck';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { HealthPanel } from './HealthPanel';

type Severity = 'error' | 'warning' | 'info';
interface Finding {
  severity: Severity;
  title: string;
  detail?: string;
  href?: string;
  items: { label: string; href?: string }[];
}
interface Report {
  generatedAt: string;
  summary: Record<Severity, number>;
  sections: { key: string; title: string; findings: Finding[] }[];
}

const STYLE: Record<Severity, { icon: React.ElementType; tone: string; chip: string; label: string }> = {
  error: { icon: AlertOctagon, tone: 'text-danger', chip: 'bg-danger/10 text-danger', label: 'Erreurs' },
  warning: { icon: AlertTriangle, tone: 'text-warning', chip: 'bg-warning/10 text-warning', label: 'À vérifier' },
  info: { icon: Info, tone: 'text-info', chip: 'bg-info/10 text-info', label: 'Pour info' },
};

function FindingCard({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  const S = STYLE[f.severity];
  const shown = open ? f.items : f.items.slice(0, 5);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <S.icon size={18} className={cn('shrink-0 mt-0.5', S.tone)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-[14px] font-bold text-ink">{f.title}</p>
            {f.href && (
              <Link to={f.href} className="inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-accent hover:underline">
                Corriger <ArrowUpRight size={13} />
              </Link>
            )}
          </div>
          {f.detail && <p className="text-[12.5px] text-muted mt-0.5">{f.detail}</p>}
          {f.items.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {shown.map((it, i) => (
                <li key={i} className="text-[12.5px] text-ink-soft">
                  {it.href ? (
                    <Link to={it.href} className="hover:underline">
                      {it.label}
                    </Link>
                  ) : (
                    it.label
                  )}
                </li>
              ))}
            </ul>
          )}
          {f.items.length > 5 && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1.5 text-[12.5px] font-semibold text-accent hover:underline">
              {open ? 'Voir moins' : `Voir les ${f.items.length - 5} autres`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** What does not add up between villas, stays, extras, payments and Lodgify (read-only). */
export function CoherencePage() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['coherence'],
    queryFn: async () => {
      const r = await apiClient.get('/extras/coherence', { timeout: 60_000 });
      return (r.data?.data ?? r.data) as Report;
    },
  });
  const total = data ? data.summary.error + data.summary.warning + data.summary.info : 0;

  return (
    <div className="space-y-6 max-w-[1100px]">
      <PageHeader
        title="Contrôle des données"
        description="Ce qui ne colle pas entre villas, séjours, extras, règlements et Lodgify. Lecture seule : rien n’est modifié ici."
      >
        <Button variant="secondary" icon={<RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />} onClick={() => refetch()}>
          Relancer
        </Button>
      </PageHeader>

      <HealthPanel />

      <FileCheck />

      {isLoading || !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(['error', 'warning', 'info'] as Severity[]).map((s) => (
              <span key={s} className={cn('h-8 px-3.5 inline-flex items-center gap-1.5 rounded-full text-[13px] font-semibold', STYLE[s].chip)}>
                {data.summary[s]} {STYLE[s].label.toLowerCase()}
              </span>
            ))}
            <span className="text-[12.5px] text-muted ml-1">Contrôlé le {new Date(data.generatedAt).toLocaleString('fr-FR')}</span>
          </div>

          {total === 0 && (
            <p className="flex items-center gap-2 rounded-2xl bg-success/10 text-success text-[14px] font-semibold px-4 py-3">
              <CheckCircle2 size={18} /> Aucune incohérence détectée.
            </p>
          )}

          {data.sections
            .filter((s) => s.findings.length)
            .map((s) => (
              <section key={s.key} className="space-y-3">
                <h2 className="text-[16px] font-bold text-ink">{s.title}</h2>
                {[...s.findings]
                  .sort((a, b) => ['error', 'warning', 'info'].indexOf(a.severity) - ['error', 'warning', 'info'].indexOf(b.severity))
                  .map((f, i) => (
                    <FindingCard key={i} f={f} />
                  ))}
              </section>
            ))}
        </>
      )}
    </div>
  );
}
