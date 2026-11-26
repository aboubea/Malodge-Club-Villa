import { useRef, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, FileWarning } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { chip, chipOff, chipOn } from '../../components/ui/segmented';

type Kind = 'extra' | 'settlement' | 'stay' | 'person';
type State = 'ok' | 'diff' | 'missing' | 'appOnly';
interface Line {
  kind: Kind;
  state: State;
  where: string;
  label: string;
  diffs: { field: string; file: string; app: string }[];
}
interface Report {
  read: { extras: number; settlements: number; stays: number; people: number; from: string | null; to: string | null };
  summary: Record<Kind, Record<State, number>>;
  lines: Line[];
  fileIssues: string[];
}

const KIND: Record<Kind, string> = { extra: 'Extras', settlement: 'Règlements', stay: 'Séjours', person: 'Personnes & taux' };
const STATE: Record<State, { label: string; tone: string }> = {
  ok: { label: 'Identique', tone: 'bg-success/10 text-success' },
  diff: { label: 'Différent', tone: 'bg-warning/10 text-warning' },
  missing: { label: 'Absent de l’appli', tone: 'bg-danger/10 text-danger' },
  appOnly: { label: 'Seulement dans l’appli', tone: 'bg-info/10 text-info' },
};
const fr = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '—');

/** The extras spreadsheet compared with the app, line by line (read-only). */
export function FileCheck() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [all, setAll] = useState(false);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append('file', file);
    try {
      const r = await apiClient.post('/extras/import/check-file', body, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90_000 });
      setReport((r.data?.data ?? r.data) as Report);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Comparaison impossible');
    } finally {
      setBusy(false);
    }
  };

  const shown = (report?.lines ?? []).filter((l) => (kind === 'all' || l.kind === kind) && (all || l.state !== 'ok'));
  const count = (k: Kind | 'all', s: State) =>
    report ? (k === 'all' ? (Object.keys(KIND) as Kind[]).reduce((n, x) => n + report.summary[x][s], 0) : report.summary[k][s]) : 0;
  const problems = report ? (['diff', 'missing', 'appOnly'] as State[]).reduce((n, s) => n + count('all', s), 0) : 0;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-peach flex items-center justify-center shrink-0">
          <FileSpreadsheet size={17} className="text-accent" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-ink">Comparer avec le fichier de suivi des extras</h2>
          <p className="text-[13px] text-muted mt-0.5 max-w-2xl">
            Chaque ligne du fichier Excel est comparée à l’appli : extras (date, client, villa, prestation, prestataire, quantité, prix, coût, statut,
            vendeur), règlements, séjours et taux. Lecture seule : rien n’est modifié.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={13} />} onClick={() => input.current?.click()}>
          {file ? file.name : 'Choisir le fichier .xlsx'}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setReport(null);
            setError(null);
          }}
        />
        <Button size="sm" disabled={!file || busy} loading={busy} onClick={run}>
          Comparer ligne par ligne
        </Button>
      </div>

      {error && <p className="rounded-xl bg-danger/10 text-danger text-[13px] px-4 py-3">{error}</p>}

      {report && (
        <div className="space-y-4">
          <p className="text-[13px] text-ink-soft">
            Lu dans le fichier : {report.read.extras} extras ({fr(report.read.from)} → {fr(report.read.to)}), {report.read.settlements} règlements,{' '}
            {report.read.stays} séjours, {report.read.people} prestataires, propriétaires et salariés.{' '}
            {problems === 0 ? (
              <b className="text-success">Tout correspond.</b>
            ) : (
              <b className="text-ink">{problems} ligne{problems > 1 ? 's' : ''} à regarder.</b>
            )}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['ok', 'diff', 'missing', 'appOnly'] as State[]).map((s) => (
              <div key={s} className="rounded-xl border border-line px-3 py-2.5">
                <p className="text-[12px] text-muted">{STATE[s].label}</p>
                <p className="text-[20px] font-bold tabular text-ink">{count(kind, s)}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['all', ...(Object.keys(KIND) as Kind[])] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn(chip, kind === k ? chipOn : chipOff)}>
                {k === 'all' ? 'Tout' : KIND[k]}
              </button>
            ))}
            <label className="ml-auto inline-flex items-center gap-2 text-[12.5px] text-ink-soft cursor-pointer">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Afficher aussi les lignes identiques
            </label>
          </div>

          {shown.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-[13px] text-success">
              <CheckCircle2 size={15} /> Rien à signaler ici : les lignes correspondent.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line overflow-hidden">
              {shown.map((l, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={cn('h-6 px-2 rounded-full text-[11.5px] font-semibold inline-flex items-center', STATE[l.state].tone)}>{STATE[l.state].label}</span>
                    <span className="text-[13.5px] font-semibold text-ink min-w-0">{l.label}</span>
                    <span className="ml-auto text-[12px] text-muted">{l.where}</span>
                  </div>
                  {l.diffs.length > 0 && (
                    <table className="mt-2 w-full text-[12.5px]">
                      <thead>
                        <tr className="text-muted text-left">
                          <th className="font-medium py-0.5 pr-3 w-[34%]">Champ</th>
                          <th className="font-medium py-0.5 pr-3">Fichier</th>
                          <th className="font-medium py-0.5">Appli</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.diffs.map((d) => (
                          <tr key={d.field}>
                            <td className="py-0.5 pr-3 text-ink-soft">{d.field}</td>
                            <td className="py-0.5 pr-3 font-semibold text-ink">{d.file}</td>
                            <td className="py-0.5 font-semibold text-warning">{d.app}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              ))}
            </ul>
          )}

          {report.fileIssues.length > 0 && (
            <div className="rounded-xl bg-surface-2 px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <FileWarning size={14} className="text-warning" /> Dans le fichier lui-même ({report.fileIssues.length})
              </p>
              <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink-soft">
                {report.fileIssues.map((x) => (
                  <li key={x}>· {x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
