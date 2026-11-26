import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowLeftRight, Layers, Link2, TriangleAlert, Unlink } from 'lucide-react';
import { VillaDto, villaCandidates } from '@malodge/shared';
import { apiClient } from '../../lib/apiClient';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';

type Villa = VillaDto & { currency?: string };

export interface MergePair {
  /** Removed: its stays, extras and documents move to `target`. */
  source: Villa;
  /** Kept (always the Lodgify listing when there is one). */
  target: Villa;
}

/**
 * Which villa is kept when `dragged` is dropped on `onto`: the Lodgify listing
 * always stays (Lodgify is the source of truth); otherwise the one dropped on.
 */
export interface GroupPair {
  /** Listing attached as a formula of `main`. */
  formula: Villa;
  /** The house (its name and photos are the ones shown). */
  main: Villa;
}

export function planMerge(dragged: Villa, onto: Villa): MergePair | { group: GroupPair } | { error: string } | null {
  if (dragged.id === onto.id) return null;
  // Two Lodgify listings are the same house offered differently (rooms, price): grouped, never merged.
  if (dragged.logifyId && onto.logifyId) return { group: { formula: dragged, main: onto } };
  if (dragged.logifyId) return { source: onto, target: dragged };
  return { source: dragged, target: onto };
}

/** Villas of the extras file that look like a Lodgify listing (same matching as the import). */
export function useDuplicatePairs(villas: Villa[]): MergePair[] {
  return useMemo(() => {
    const lodgify = villas.filter((v) => v.logifyId);
    const pairs: MergePair[] = [];
    for (const v of villas) {
      if (v.logifyId) continue;
      const best = villaCandidates(v.name, lodgify)[0];
      const target = best && lodgify.find((l) => l.id === best.id);
      if (target) pairs.push({ source: v, target });
    }
    return pairs;
  }, [villas]);
}

interface Preview {
  source: { name: string; lodgify: boolean; currency: string; country: string; stays: number; extras: number };
  target: { name: string; lodgify: boolean; currency: string; country: string; stays: number; extras: number };
  currency: string;
  currencyChanges: boolean;
  blocker: string | null;
}

const CURRENCY_NAMES: Record<string, string> = { MAD: 'dirham (MAD)', EUR: 'euro (EUR)', USD: 'dollar (USD)', GBP: 'livre (GBP)' };
const currencyName = (c: string) => CURRENCY_NAMES[c] ?? c;

function VillaCard({ v, role, extra }: { v: Villa; role: 'source' | 'target'; extra?: Preview['source'] }) {
  return (
    <div className={cn('rounded-2xl border p-4', role === 'target' ? 'border-accent/40 bg-peach/60' : 'border-line bg-surface')}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
          {role === 'target' ? 'Conservée' : 'Supprimée après transfert'}
        </p>
        <span className="text-[11.5px] text-muted">{v.logifyId ? 'Lodgify' : 'Créée dans l’appli'}</span>
      </div>
      <p className="text-[15px] font-bold text-ink mt-1">{v.name}</p>
      <p className="text-[12.5px] text-ink-soft mt-0.5">
        {[v.city, v.country].filter(Boolean).join(', ')}
        {extra ? ` · ${extra.stays} séjour${extra.stays > 1 ? 's' : ''} · ${extra.extras} extra${extra.extras > 1 ? 's' : ''} · ${extra.currency}` : ''}
      </p>
    </div>
  );
}

/** Confirmation of a merge, with what moves and in which currency. */
export function MergeVillaModal({ pair, onClose, onMerged }: { pair: MergePair | null; onClose: () => void; onMerged?: (targetId: string) => void }) {
  const qc = useQueryClient();
  const [swapped, setSwapped] = useState(false);
  const current = pair && swapped && !pair.source.logifyId && !pair.target.logifyId ? { source: pair.target, target: pair.source } : pair;

  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['villa-merge-preview', current?.source.id, current?.target.id],
    queryFn: async () => {
      const res = await apiClient.get(`/extras/villas/${current!.source.id}/merge-preview`, { params: { targetId: current!.target.id } });
      return (res.data?.data ?? res.data) as Preview;
    },
    enabled: !!current,
    retry: false,
  });

  const merge = useMutation({
    mutationFn: () => apiClient.post(`/extras/villas/${current!.source.id}/merge`, { targetId: current!.target.id }),
    onSuccess: (res) => {
      const d = res.data?.data ?? res.data;
      toast.success(`« ${d.merged} » fusionnée dans « ${d.into} » : ${d.stays} séjour(s), ${d.extras} extra(s) déplacés`);
      qc.invalidateQueries({ queryKey: ['villas'] });
      qc.invalidateQueries({ queryKey: ['extras'] });
      onMerged?.(current!.target.id);
      close();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Fusion impossible'),
  });

  const close = () => {
    setSwapped(false);
    onClose();
  };

  if (!current) return null;
  const canSwap = !pair!.source.logifyId && !pair!.target.logifyId;
  const blocker = preview?.blocker ?? ((error as any)?.response?.data?.message || null);

  return (
    <Modal
      open={!!pair}
      onClose={close}
      title="Fusionner les doublons"
      description="Les deux fiches deviennent une seule villa. Rien n’est modifié dans Lodgify."
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          {canSwap ? (
            <Button variant="ghost" size="sm" icon={<ArrowLeftRight size={13} />} onClick={() => setSwapped((s) => !s)}>
              Garder l’autre
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Annuler
            </Button>
            <Button icon={<Link2 size={14} />} loading={merge.isPending} disabled={isLoading || !!blocker} onClick={() => merge.mutate()}>
              Fusionner
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2">
        <VillaCard v={current.source} role="source" extra={preview?.source} />
        <div className="flex justify-center text-muted">
          <ArrowDown size={18} />
        </div>
        <VillaCard v={current.target} role="target" extra={preview?.target} />
      </div>

      {blocker ? (
        <div className="mt-4 flex gap-2.5 rounded-xl border border-danger/25 bg-danger/5 p-3 text-[13px] text-danger">
          <TriangleAlert size={16} className="shrink-0 mt-0.5" />
          <p>{blocker}</p>
        </div>
      ) : preview ? (
        <ul className="mt-4 space-y-1.5 text-[13px] text-ink-soft list-disc pl-5">
          <li>
            {preview.source.stays} séjour(s) et {preview.source.extras} extra(s) passent sur « {preview.target.name} », avec leurs documents.
          </li>
          <li>
            Devise des extras : <b className="text-ink">{currencyName(preview.currency)}</b>. Les montants restent dans leur devise
            d’origine, aucune conversion.
            {preview.currencyChanges && ` « ${preview.target.name} » passe de ${preview.target.currency} à ${preview.currency}.`}
          </li>
          <li>Le nom « {preview.source.name} » est retenu : les prochains imports du fichier d’extras iront sur la villa conservée.</li>
        </ul>
      ) : (
        <p className="mt-4 text-[13px] text-muted">Calcul de ce qui sera déplacé…</p>
      )}
    </Modal>
  );
}

/** Banner listing likely duplicates with a one-click merge (also the touch-screen way to merge). */
export function DuplicatesBanner({ pairs, onPick }: { pairs: MergePair[]; onPick: (pair: MergePair) => void }) {
  const [open, setOpen] = useState(false);
  if (!pairs.length) return null;
  const shown = open ? pairs : pairs.slice(0, 3);
  return (
    <div className="rounded-2xl border border-accent/25 bg-peach/50 p-4">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0">
          <Link2 size={15} className="text-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-ink">
            {pairs.length} doublon{pairs.length > 1 ? 's' : ''} probable{pairs.length > 1 ? 's' : ''} avec Lodgify
          </p>
          <p className="text-[12.5px] text-ink-soft mt-0.5">
            Glissez une villa sur son doublon dans la liste, ou fusionnez ci-dessous. La fiche Lodgify est toujours conservée.
          </p>
          <div className="mt-3 space-y-1.5">
            {shown.map((p) => (
              <div key={p.source.id} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                <p className="min-w-0 flex-1 text-[12.5px] text-ink truncate">
                  <b>{p.source.name}</b> <span className="text-muted">→</span> {p.target.name}
                </p>
                <Button size="sm" variant="secondary" onClick={() => onPick(p)}>
                  Fusionner
                </Button>
              </div>
            ))}
          </div>
          {pairs.length > 3 && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-[12.5px] font-semibold text-accent hover:underline">
              {open ? 'Voir moins' : `Voir les ${pairs.length - 3} autres`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Formulas of a house ───────────────────────────── */

const capacity = (v: { bedrooms?: number; maxGuests?: number }) =>
  [v.bedrooms ? `${v.bedrooms} ch.` : null, v.maxGuests ? `${v.maxGuests} voyageurs` : null].filter(Boolean).join(' · ') || 'capacité non renseignée';

/** Confirmation of grouping two Lodgify listings as formulas of one house. */
export function GroupVillaModal({ pair, onClose, onDone }: { pair: GroupPair | null; onClose: () => void; onDone?: (mainId: string) => void }) {
  const qc = useQueryClient();
  const [swapped, setSwapped] = useState(false);
  const current = pair && swapped ? { formula: pair.main, main: pair.formula } : pair;
  const group = useMutation({
    mutationFn: () => apiClient.post(`/extras/villas/${current!.formula.id}/group`, { targetId: current!.main.id }),
    onSuccess: (res) => {
      const d = res.data?.data ?? res.data;
      toast.success(`« ${d.grouped} » est maintenant une formule de « ${d.into} »`);
      qc.invalidateQueries({ queryKey: ['villas'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['extras'] });
      onDone?.(current!.main.id);
      close();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Regroupement impossible'),
  });
  const close = () => {
    setSwapped(false);
    onClose();
  };
  if (!current) return null;
  return (
    <Modal
      open={!!pair}
      onClose={close}
      title="Regrouper en formules d’une même villa"
      description="La même maison proposée avec plus ou moins de chambres, chacune à son prix. Rien n’est modifié dans Lodgify."
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <Button variant="ghost" size="sm" icon={<ArrowLeftRight size={13} />} onClick={() => setSwapped((s) => !s)}>
            Inverser
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Annuler
            </Button>
            <Button icon={<Layers size={14} />} loading={group.isPending} onClick={() => group.mutate()}>
              Regrouper
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2">
        <div className="rounded-2xl border border-accent/40 bg-peach/60 p-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Villa principale (nom et photos affichés)</p>
          <p className="text-[15px] font-bold text-ink mt-1">{current.main.name}</p>
          <p className="text-[12.5px] text-ink-soft mt-0.5">{capacity(current.main)}</p>
        </div>
        <div className="flex justify-center text-muted">
          <Layers size={18} />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Rattachée comme formule</p>
          <p className="text-[15px] font-bold text-ink mt-1">{current.formula.name}</p>
          <p className="text-[12.5px] text-ink-soft mt-0.5">{capacity(current.formula)}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 text-[13px] text-ink-soft list-disc pl-5">
        <li>Les deux annonces restent séparées dans Lodgify ; chaque réservation garde le prix de la formule réservée.</li>
        <li>Le calendrier montre la maison sur une seule ligne : une réservation sur chaque formule aux mêmes dates est signalée comme double réservation.</li>
        <li>Même propriétaire et même devise pour les deux formules. Réversible à tout moment (« Dégrouper »).</li>
      </ul>
    </Modal>
  );
}

/** Formulas of a house, shown in its preview, each can be ungrouped. */
export function VillaFormulas({ villa, canEdit }: { villa: Villa; canEdit: boolean }) {
  const qc = useQueryClient();
  const ungroup = useMutation({
    mutationFn: (id: string) => apiClient.post(`/extras/villas/${id}/ungroup`),
    onSuccess: (res) => {
      toast.success(`« ${(res.data?.data ?? res.data).ungrouped} » est de nouveau une villa à part`);
      qc.invalidateQueries({ queryKey: ['villas'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Impossible de dégrouper'),
  });
  if (!villa.formulas?.length) return null;
  return (
    <div className="mb-4 rounded-2xl border border-line p-3.5">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
        <Layers size={14} className="text-info" /> Formules Lodgify de cette villa
      </p>
      <ul className="mt-2 space-y-1.5 text-[12.5px]">
        <li className="flex items-center gap-2 text-ink-soft">
          <span className="min-w-0 flex-1 truncate">
            <b className="text-ink">{villa.name}</b> · {capacity(villa)}
          </span>
          <span className="text-[11px] text-muted">principale</span>
        </li>
        {villa.formulas.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-ink-soft">
            <span className="min-w-0 flex-1 truncate">
              <b className="text-ink">{f.name}</b> · {capacity(f)}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => ungroup.mutate(f.id)}
                disabled={ungroup.isPending}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted hover:text-ink"
                title="En refaire une villa à part"
              >
                <Unlink size={12} /> Dégrouper
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
