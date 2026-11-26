import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, CloudDownload, FileSpreadsheet, Layers, Link2, Merge, Users } from 'lucide-react';
import { VillaDto } from '@malodge/shared';
import { formulaSuggestions } from './formulaSuggestions';
import { apiClient } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { GroupPair, GroupVillaModal, MergePair, MergeVillaModal, useDuplicatePairs } from '../villas/VillaMerge';
import { MergePeopleModal, PeoplePair, usePeopleDuplicates } from '../users/PeopleMerge';

type Villa = VillaDto & { currency?: string; parentVillaId?: string | null };

function Step({ n, title, done, count, icon: Icon, children }: { n: number; title: string; done: boolean; count?: number; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-2xl border bg-surface p-4 sm:p-5', done ? 'border-success/30' : 'border-line')}>
      <div className="flex items-start gap-3">
        <span className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[14px] font-bold', done ? 'bg-success/10 text-success' : 'bg-surface-2 text-ink')}>
          {done ? <CheckCircle2 size={18} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon size={16} className="text-muted" />
            <h2 className="text-[15px] font-bold text-ink">{title}</h2>
            {count != null && count > 0 && <span className="h-6 px-2.5 rounded-full bg-peach text-ink text-[12px] font-semibold inline-flex items-center">{count} à traiter</span>}
            {done && <span className="text-[12.5px] font-semibold text-success">Fait</span>}
          </div>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** The last clean-up before Lodgify becomes the only source, step by step. */
export function CleanupPage() {
  const qc = useQueryClient();
  const [mergePair, setMergePair] = useState<MergePair | null>(null);
  const [groupPair, setGroupPair] = useState<GroupPair | null>(null);
  const [peoplePair, setPeoplePair] = useState<PeoplePair | null>(null);

  const villasQ = useQuery({
    queryKey: ['villas', 'cleanup'],
    queryFn: async () => {
      const r = await apiClient.get('/villas', { params: { page: 1, limit: 1000 } });
      const d = r.data?.data ?? r.data;
      return (d?.data ?? d) as Villa[];
    },
  });
  const villas = villasQ.data ?? [];
  const duplicates = useDuplicatePairs(villas);
  const formulas = useMemo(() => formulaSuggestions(villas), [villas]);
  const people = usePeopleDuplicates(true);

  const missingQ = useQuery({
    queryKey: ['lodgify', 'missing'],
    queryFn: async () => {
      const r = await apiClient.get('/lodgify/properties/missing', { timeout: 60_000 });
      return (r.data?.data ?? r.data) as { configured: boolean; listings: { id: string; name: string }[] };
    },
  });
  const missing = missingQ.data?.listings ?? [];
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  useEffect(() => setChosen(new Set(missing.map((l) => l.id))), [missingQ.data]);

  const importQ = useQuery({
    queryKey: ['extras', 'import-status'],
    queryFn: async () => {
      const r = await apiClient.get('/extras/import');
      return (r.data?.data ?? r.data) as { imported: boolean; details: { at?: string; file?: string } | null; retired: { at: string } | null };
    },
  });

  const importListings = useMutation({
    mutationFn: () => apiClient.post('/lodgify/properties/import', { ids: [...chosen] }, { timeout: 120_000 }),
    onSuccess: (r) => {
      const d = r.data?.data ?? r.data;
      toast.success(`${d?.created ?? d?.imported ?? chosen.size} annonce(s) ajoutée(s) depuis Lodgify`);
      qc.invalidateQueries({ queryKey: ['lodgify', 'missing'] });
      qc.invalidateQueries({ queryKey: ['villas'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Import impossible'),
  });
  const retire = useMutation({
    mutationFn: (retired: boolean) => apiClient.post('/extras/import/retire', { retired }),
    onSuccess: (_r, retired) => {
      toast.success(retired ? 'Import Excel retiré : Lodgify est la source unique' : 'Import Excel réactivé');
      qc.invalidateQueries({ queryKey: ['extras', 'import-status'] });
    },
  });

  const peopleList = people.data ?? [];
  const steps = [!!missingQ.data?.configured && missing.length === 0, duplicates.length === 0 && !villasQ.isLoading, formulas.length === 0 && !villasQ.isLoading, peopleList.length === 0 && !people.isLoading, !!importQ.data?.retired];
  const doneCount = steps.filter(Boolean).length;
  const allClean = steps.slice(0, 4).every(Boolean);

  return (
    <div className="space-y-4 max-w-[900px]">
      <PageHeader
        title="Nettoyage des données"
        description="Les dernières étapes pour que Lodgify devienne la source unique des villas et des séjours. Lodgify reste en lecture seule : rien n’y est modifié."
      />
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <span className="text-[13px] font-semibold text-ink tabular">
          {doneCount}/{steps.length} étapes
        </span>
      </div>

      <Step n={1} title="Annonces Lodgify absentes de l’appli" icon={CloudDownload} done={steps[0]} count={missing.length}>
        {!missingQ.data ? (
          <p className="text-[13px] text-muted">Lecture des annonces Lodgify…</p>
        ) : !missingQ.data.configured ? (
          <p className="text-[13px] text-muted">
            Clé Lodgify non configurée : <Link to="/parametres" className="font-semibold text-accent">Paramètres</Link>.
          </p>
        ) : missing.length === 0 ? (
          <p className="text-[13px] text-ink-soft">Toutes les annonces Lodgify sont dans l’appli.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-ink-soft">Leurs réservations ne s’affichent pas tant que l’annonce n’est pas dans l’appli. Décochez celles à ignorer (annonces archivées…).</p>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-line divide-y divide-line">
              {missing.map((l) => (
                <label key={l.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink cursor-pointer hover:bg-surface-2/50">
                  <input
                    type="checkbox"
                    checked={chosen.has(l.id)}
                    onChange={(e) =>
                      setChosen((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(l.id);
                        else next.delete(l.id);
                        return next;
                      })
                    }
                  />
                  {l.name}
                </label>
              ))}
            </div>
            <Button icon={<CloudDownload size={14} />} disabled={!chosen.size} loading={importListings.isPending} onClick={() => importListings.mutate()}>
              Ajouter {chosen.size} annonce{chosen.size > 1 ? 's' : ''}
            </Button>
          </div>
        )}
      </Step>

      <Step n={2} title="Villas du fichier Excel en double d’une annonce Lodgify" icon={Link2} done={steps[1]} count={duplicates.length}>
        {duplicates.length === 0 ? (
          <p className="text-[13px] text-ink-soft">Aucune villa du fichier ne double une annonce Lodgify.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[13px] text-ink-soft mb-2">La fusion déplace séjours, extras et documents sur l’annonce Lodgify, qui est conservée.</p>
            {duplicates.map((p) => (
              <div key={p.source.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <p className="min-w-0 flex-1 text-[13px] text-ink truncate">
                  <b>{p.source.name}</b> <span className="text-muted">→</span> {p.target.name}
                </p>
                <Button size="sm" variant="secondary" icon={<Merge size={13} />} onClick={() => setMergePair(p)}>
                  Fusionner
                </Button>
              </div>
            ))}
          </div>
        )}
      </Step>

      <Step n={3} title="Formules d’une même maison à regrouper" icon={Layers} done={steps[2]} count={formulas.length}>
        {formulas.length === 0 ? (
          <p className="text-[13px] text-ink-soft">Aucune annonce Lodgify ne semble être une autre formule d’une même maison.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[13px] text-ink-soft mb-2">Une maison proposée avec plus ou moins de chambres (prix différents) : regroupées, elles comptent pour une villa dans le calendrier, la performance et les relevés.</p>
            {formulas.map((p) => (
              <div key={p.formula.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <p className="min-w-0 flex-1 text-[13px] text-ink truncate">
                  <b>{p.formula.name}</b> <span className="text-muted">formule de</span> {p.main.name}
                </p>
                <Button size="sm" variant="secondary" icon={<Layers size={13} />} onClick={() => setGroupPair(p)}>
                  Regrouper
                </Button>
              </div>
            ))}
          </div>
        )}
      </Step>

      <Step n={4} title="Clients et prestataires saisis deux fois" icon={Users} done={steps[3]} count={peopleList.length}>
        {peopleList.length === 0 ? (
          <p className="text-[13px] text-ink-soft">Aucun doublon probable.</p>
        ) : (
          <div className="space-y-1.5">
            {peopleList.map((d) => (
              <div key={`${d.drop.id}-${d.keep.id}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <p className="min-w-0 flex-1 text-[13px] text-ink truncate">
                  <b>{d.drop.name}</b> <span className="text-muted">→</span> {d.keep.name}
                </p>
                <Button size="sm" variant="secondary" icon={<Merge size={13} />} onClick={() => setPeoplePair({ source: d.drop, target: d.keep })}>
                  Fusionner
                </Button>
              </div>
            ))}
          </div>
        )}
      </Step>

      <Step n={5} title="Lodgify, source unique" icon={FileSpreadsheet} done={steps[4]}>
        {importQ.data?.retired ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-ink-soft flex-1">
              L’import Excel est retiré depuis le {new Date(importQ.data.retired.at).toLocaleDateString('fr-FR')} : villas et séjours viennent de Lodgify, les extras se saisissent dans l’appli.
            </p>
            <Button size="sm" variant="ghost" loading={retire.isPending} onClick={() => retire.mutate(false)}>
              Réactiver l’import
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-ink-soft">
              Une fois les étapes 1 à 4 faites, retirez l’import du fichier Excel : plus de risque de recréer des doublons. Les données déjà importées restent ; vous pourrez le réactiver.
            </p>
            {!allClean && <p className="text-[12.5px] text-warning">Il reste des étapes à faire au-dessus.</p>}
            <Button
              variant={allClean ? 'primary' : 'secondary'}
              loading={retire.isPending}
              onClick={() => {
                if (allClean || window.confirm('Il reste des points à nettoyer. Retirer quand même l’import Excel ?')) retire.mutate(true);
              }}
            >
              Retirer l’import Excel
            </Button>
          </div>
        )}
      </Step>

      <MergeVillaModal pair={mergePair} onClose={() => setMergePair(null)} onMerged={() => qc.invalidateQueries({ queryKey: ['villas'] })} />
      <GroupVillaModal pair={groupPair} onClose={() => setGroupPair(null)} onDone={() => qc.invalidateQueries({ queryKey: ['villas'] })} />
      <MergePeopleModal pair={peoplePair} onClose={() => setPeoplePair(null)} />
    </div>
  );
}
