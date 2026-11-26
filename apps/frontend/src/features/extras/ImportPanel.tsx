import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../lib/apiClient';
import { cn } from '../../lib/utils';

interface ImportReport {
  dryRun: boolean;
  file: string | null;
  read: { people: number; villas: number; catalogue: number; extras: number; settlements: number };
  people: Record<'CLIENT' | 'PROVIDER' | 'OWNER' | 'EMPLOYEE', { created: number; reused: number }>;
  villas: { created: string[]; updated: string[]; matched?: string[] };
  catalogue: { created: number; updated: number; categoriesCreated: string[] };
  stays: { created: number; fromExtras: string[]; datesEstimated: string[]; skipped: string[] };
  adjusted: string[];
  extras: number;
  settlements: { validated: number; pending: number; cancelled: number };
  warnings: string[];
  durationMs: number;
}

interface UndoReport {
  dryRun: boolean;
  file: string | null;
  importedAt: string | null;
  toDelete: { stays: number; extras: number; settlements: number; people: number; villas: number; services: number; categories: number };
  modifiedSince: { extras: number; settlements: number; stays: number };
  blockers: string[];
}

const PEOPLE_LABELS = { CLIENT: 'Clients', PROVIDER: 'Prestataires', OWNER: 'Propriétaires', EMPLOYEE: 'Salariés' } as const;

function errorMessage(e: unknown) {
  const err = e as { code?: string; response?: { status?: number; data?: { message?: string | string[] } } };
  const msg = err?.response?.data?.message;
  if (msg) return Array.isArray(msg) ? msg.join(' ') : msg;
  if (err?.code === 'ECONNABORTED' || err?.response?.status === 504) {
    return 'Le serveur n’a pas répondu à temps. Rien n’a été enregistré : réessayez dans un instant.';
  }
  return `Import impossible${err?.response?.status ? ` (erreur ${err.response.status})` : ''}.`;
}

function ReportView({ r }: { r: ImportReport }) {
  const rows: [string, string][] = [
    ['Extras', `${r.extras} sur ${r.read.extras} lignes`],
    ['Séjours créés', `${r.stays.created}`],
    ['Règlements', `${r.settlements.validated} validés · ${r.settlements.pending} à valider${r.settlements.cancelled ? ` · ${r.settlements.cancelled} annulés` : ''}`],
    ['Catalogue', `${r.catalogue.created} prestations créées · ${r.catalogue.updated} mises à jour`],
    ['Villas', `${r.villas.created.length} créées · ${(r.villas.matched?.length ?? 0) + r.villas.updated.length} existantes reprises (devise MAD, propriétaire)`],
    ...(Object.keys(PEOPLE_LABELS) as (keyof typeof PEOPLE_LABELS)[]).map(
      (k) => [PEOPLE_LABELS[k], `${r.people[k].created} fiches créées · ${r.people[k].reused} existantes reprises`] as [string, string],
    ),
  ];
  return (
    <div className="space-y-4">
      <dl className="rounded-xl border border-line divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-[13px]">
            <dt className="font-semibold text-ink">{k}</dt>
            <dd className="text-ink-soft text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {r.adjusted.length > 0 && (
        <div className="rounded-xl border border-info/25 bg-info/5 px-4 py-3">
          <p className="text-[13px] font-bold text-ink">Montants saisis à la main dans l’Excel, repris tels quels ({r.adjusted.length})</p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-ink-soft list-disc pl-5">
            {r.adjusted.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {(r.stays.datesEstimated.length > 0 || r.stays.skipped.length > 0) && (
        <p className="text-[12.5px] text-muted">
          {r.stays.datesEstimated.length > 0 && (
            <>
              Séjours sans dates dans l’Excel, dates déduites et marquées « à confirmer » : <b className="text-ink-soft">{r.stays.datesEstimated.join(', ')}</b>.{' '}
            </>
          )}
          {r.stays.skipped.length > 0 && (
            <>
              Non créés (ni dates ni extras) : <b className="text-ink-soft">{r.stays.skipped.join(', ')}</b>.
            </>
          )}
        </p>
      )}
      {!!r.villas.matched?.length && (
        <p className="text-[12.5px] text-muted">
          Villas de l’Excel rattachées à une villa existante (Lodgify) : <b className="text-ink-soft">{r.villas.matched.join(' ; ')}</b>.
        </p>
      )}
      {r.villas.updated.length > 0 && (
        <p className="text-[12.5px] text-muted">
          Villas déjà présentes dans l’application, rattachées au suivi : <b className="text-ink-soft">{r.villas.updated.join(', ')}</b>.
        </p>
      )}
      {r.warnings.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning/5 px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
            <AlertTriangle size={15} className="text-warning" /> Points à vérifier après l’import ({r.warnings.length})
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-ink-soft list-disc pl-5">
            {r.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Admin-only: upload the extras spreadsheet, preview, then import in one transaction. */
export function ImportPanel() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [done, setDone] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [undo, setUndo] = useState<UndoReport | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);

  const runUndo = async (dryRun: boolean) => {
    setError(null);
    setUndoBusy(true);
    try {
      const r = await apiClient.post(`/extras/import/undo?dryRun=${dryRun}`, {}, { timeout: 60_000 });
      const report = (r.data?.data ?? r.data) as UndoReport;
      if (dryRun) setUndo(report);
      else {
        setUndo(null);
        setDone(null);
        setPreview(null);
        setFile(null);
        qc.invalidateQueries({ queryKey: ['extras'] });
        toast.success('Import annulé : vous pouvez importer à nouveau');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUndoBusy(false);
    }
  };

  const { data: status } = useQuery({
    queryKey: ['extras', 'import-status'],
    queryFn: async () => {
      const r = await apiClient.get('/extras/import');
      return (r.data?.data ?? r.data) as { imported: boolean; details: { file?: string; at?: string; extras?: number } | null };
    },
  });

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setError(null);
    setBusy(dryRun ? 'preview' : 'import');
    const body = new FormData();
    body.append('file', file);
    try {
      const r = await apiClient.post(`/extras/import?dryRun=${dryRun}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      });
      const report = (r.data?.data ?? r.data) as ImportReport;
      if (dryRun) setPreview(report);
      else {
        setDone(report);
        setPreview(null);
        qc.invalidateQueries({ queryKey: ['extras'] });
        toast.success('Import terminé');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 space-y-4">
        <p className="flex items-center gap-2 text-[16px] font-bold text-ink">
          <CheckCircle2 size={20} className="text-success" /> Import terminé
        </p>
        <ReportView r={done} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 space-y-5">
      <div>
        <p className="text-[15px] font-bold text-ink">Importer le fichier Excel de suivi</p>
        <p className="text-[13px] text-muted mt-1 max-w-2xl">
          Reprend les réglages (personnes, taux, villas), le catalogue, les extras et les règlements du fichier « Suivi extras ».
          L’analyse ne modifie rien ; l’import se fait ensuite en une seule fois, ou pas du tout en cas d’erreur.
        </p>
      </div>

      {status?.imported ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-ink-soft">
            Un fichier a déjà été importé
            {status.details?.file ? <> (<b className="text-ink">{status.details.file}</b>)</> : null}
            {status.details?.at ? <> le {new Date(status.details.at).toLocaleString('fr-FR')}</> : null}. Un second import créerait des doublons :
            il est bloqué. Pour corriger l’import, annulez-le puis importez à nouveau.
          </div>

          {error && <p className="rounded-xl bg-danger/10 text-danger text-[13px] px-4 py-3">{error}</p>}

          {undo && (
            <div className="rounded-xl border border-line px-4 py-4 space-y-3 text-[13px]">
              <p className="font-bold text-ink">L’annulation supprimera ce que l’import a créé</p>
              <p className="text-ink-soft">
                {undo.toDelete.extras} extras, {undo.toDelete.settlements} règlements, {undo.toDelete.stays} séjours, {undo.toDelete.people} fiches,{' '}
                {undo.toDelete.villas} villas, {undo.toDelete.services} prestations et {undo.toDelete.categories} catégories. Les villas, personnes et prestations
                qui existaient avant l’import sont conservées.
              </p>
              {undo.modifiedSince.extras + undo.modifiedSince.settlements + undo.modifiedSince.stays > 0 && (
                <p className="text-warning font-semibold">
                  Modifié depuis l’import, et donc perdu : {undo.modifiedSince.extras} extra(s), {undo.modifiedSince.settlements} règlement(s),{' '}
                  {undo.modifiedSince.stays} séjour(s).
                </p>
              )}
              {undo.blockers.length > 0 ? (
                <div className="rounded-lg bg-danger/10 text-danger px-3 py-2">
                  <p className="font-semibold">Annulation impossible : des données saisies depuis s’appuient sur l’import.</p>
                  <ul className="list-disc pl-5 mt-1">
                    {undo.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => setUndo(null)} disabled={undoBusy}>
                    Garder l’import
                  </Button>
                  <Button variant="destructive" loading={undoBusy} onClick={() => runUndo(false)}>
                    Supprimer les données importées
                  </Button>
                </div>
              )}
            </div>
          )}

          {!undo && (
            <div className="flex justify-end">
              <Button variant="secondary" loading={undoBusy} onClick={() => runUndo(true)}>
                Annuler cet import…
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={cn(
              'w-full rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
              file ? 'border-line-strong bg-surface-2/50' : 'border-line hover:border-line-strong hover:bg-surface-2/40',
            )}
          >
            <span className="mx-auto mb-3 w-11 h-11 rounded-full bg-peach flex items-center justify-center">
              {file ? <FileSpreadsheet size={20} className="text-accent" /> : <Upload size={20} className="text-accent" />}
            </span>
            <p className="text-[14px] font-semibold text-ink">{file ? file.name : 'Choisir le fichier .xlsx'}</p>
            <p className="text-[12.5px] text-muted mt-0.5">{file ? `${(file.size / 1024 / 1024).toFixed(1)} Mo — cliquer pour changer` : '4 Mo maximum'}</p>
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setError(null);
            }}
          />

          {error && <p className="rounded-xl bg-danger/10 text-danger text-[13px] px-4 py-3">{error}</p>}

          {preview && (
            <div className="space-y-3">
              <p className="text-[14px] font-bold text-ink">Aperçu — rien n’a encore été enregistré</p>
              <ReportView r={preview} />
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={!file || !!busy} loading={busy === 'preview'} onClick={() => send(true)}>
              {preview ? 'Analyser à nouveau' : 'Analyser le fichier'}
            </Button>
            <Button disabled={!file || !preview || !!busy} loading={busy === 'import'} onClick={() => send(false)}>
              Importer
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
