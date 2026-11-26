import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowLeftRight, Merge, TriangleAlert, Users } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { formatDay } from '../../lib/utils';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

export interface PersonRef {
  id: string;
  name: string;
}
export interface PeoplePair {
  /** Removed once everything is moved. */
  source: PersonRef;
  /** Kept. */
  target: PersonRef;
}

const ROLE_LABEL: Record<string, string> = { CLIENT: 'Client', PROVIDER: 'Prestataire', OWNER: 'Propriétaire', EMPLOYEE: 'Salarié' };

interface Duplicate {
  role: string;
  keep: PersonRef & { stays: number; extras: number; settlements: number };
  drop: PersonRef & { stays: number; extras: number; settlements: number };
}

interface Preview {
  role: string;
  source: { id: string; name: string; email: string | null; canLogin: boolean };
  target: { id: string; name: string; email: string | null; canLogin: boolean };
  moves: { stays: number; extras: number; settlements: number; villas: number };
  takesEmail: boolean;
  stayPairs: { villa: string; from: { label: string; checkIn: string | null; checkOut: string | null }; into: { label: string; checkIn: string | null; checkOut: string | null } }[];
}

export function usePeopleDuplicates(enabled: boolean) {
  return useQuery({
    queryKey: ['people-duplicates'],
    queryFn: async () => {
      const r = await apiClient.get('/extras/people/duplicates');
      return (r.data?.data ?? r.data) as Duplicate[];
    },
    enabled,
  });
}

const dates = (d: { checkIn: string | null; checkOut: string | null }) =>
  d.checkIn || d.checkOut ? `${formatDay(d.checkIn)} → ${formatDay(d.checkOut)}` : 'dates non renseignées';

/** Two records of the same person (typo): everything moves to the one kept, the other is deleted. */
export function MergePeopleModal({ pair, onClose }: { pair: PeoplePair | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [swapped, setSwapped] = useState(false);
  const [mergeStays, setMergeStays] = useState(true);
  useEffect(() => {
    setSwapped(false);
    setMergeStays(true);
  }, [pair?.source.id, pair?.target.id]);
  const current = pair && swapped ? { source: pair.target, target: pair.source } : pair;

  const { data: preview, error, isLoading } = useQuery({
    queryKey: ['people-merge-preview', current?.source.id, current?.target.id],
    queryFn: async () => {
      const r = await apiClient.get(`/extras/people/${current!.source.id}/merge-preview`, { params: { targetId: current!.target.id } });
      return (r.data?.data ?? r.data) as Preview;
    },
    enabled: !!current,
    retry: false,
  });

  const merge = useMutation({
    mutationFn: () => apiClient.post(`/extras/people/${current!.source.id}/merge`, { targetId: current!.target.id, mergeStays }),
    onSuccess: (res) => {
      const d = res.data?.data ?? res.data;
      toast.success(
        `« ${d.merged} » fusionné dans « ${d.into} » : ${d.stays} séjour(s), ${d.extras} extra(s), ${d.settlements} règlement(s) repris${d.mergedStays ? `, ${d.mergedStays} séjour(s) fusionné(s)` : ''}`,
      );
      for (const k of [['users'], ['extras'], ['reservations'], ['people-duplicates'], ['coherence']]) qc.invalidateQueries({ queryKey: k });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Fusion impossible'),
  });

  if (!current) return null;
  const blocker = (error as any)?.response?.data?.message as string | undefined;

  return (
    <Modal
      open={!!pair}
      onClose={onClose}
      title="Fusionner deux fiches"
      description="La même personne saisie deux fois (faute de frappe…). Tout ce qui est rattaché à la fiche supprimée passe sur la fiche conservée."
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <Button variant="ghost" size="sm" icon={<ArrowLeftRight size={13} />} onClick={() => setSwapped((s) => !s)}>
            Garder l’autre
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button icon={<Merge size={14} />} loading={merge.isPending} disabled={isLoading || !!blocker} onClick={() => merge.mutate()}>
              Fusionner
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Supprimée après transfert</p>
          <p className="text-[15px] font-bold text-ink mt-1">{current.source.name}</p>
          {preview && (
            <p className="text-[12.5px] text-ink-soft mt-0.5">
              {ROLE_LABEL[preview.role] ?? preview.role} · {preview.source.email ?? 'sans e-mail'}
            </p>
          )}
        </div>
        <div className="flex justify-center text-muted">
          <ArrowDown size={18} />
        </div>
        <div className="rounded-2xl border border-accent/40 bg-peach/60 p-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Conservée</p>
          <p className="text-[15px] font-bold text-ink mt-1">{current.target.name}</p>
          {preview && (
            <p className="text-[12.5px] text-ink-soft mt-0.5">
              {ROLE_LABEL[preview.role] ?? preview.role} · {preview.target.email ?? 'sans e-mail'}
            </p>
          )}
        </div>
      </div>

      {blocker ? (
        <div className="mt-4 flex gap-2.5 rounded-xl border border-danger/25 bg-danger/5 p-3 text-[13px] text-danger">
          <TriangleAlert size={16} className="shrink-0 mt-0.5" />
          <p>{blocker}</p>
        </div>
      ) : preview ? (
        <div className="mt-4 space-y-3 text-[13px] text-ink-soft">
          <ul className="space-y-1.5 list-disc pl-5">
            <li>
              Repris par « {preview.target.name} » : {preview.moves.stays} séjour(s), {preview.moves.extras} extra(s), {preview.moves.settlements} règlement(s)
              {preview.moves.villas ? `, ${preview.moves.villas} villa(s) en propriété` : ''}.
            </li>
            {preview.takesEmail && <li>La fiche conservée reprend l’e-mail {preview.source.email} (et son accès à l’application).</li>}
            <li>L’ancien nom est retenu : le fichier d’extras (vérification des dates, réimport) tombera sur la fiche conservée.</li>
          </ul>
          {preview.stayPairs.length > 0 && (
            <label className="flex items-start gap-2.5 rounded-xl border border-line p-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={mergeStays} onChange={(e) => setMergeStays(e.target.checked)} />
              <span>
                <b className="text-ink">Fusionner aussi leurs séjours dans la même villa</b> (même séjour saisi deux fois) :
                <span className="block mt-1 space-y-0.5">
                  {preview.stayPairs.map((p, i) => (
                    <span key={i} className="block text-[12.5px]">
                      {p.villa} : « {p.from.label} » ({dates(p.from)}) → « {p.into.label} » ({dates(p.into)})
                    </span>
                  ))}
                </span>
                <span className="block mt-1 text-[12px] text-muted">Le séjour fusionné garde la première arrivée et le dernier départ connus, sans inventer de date.</span>
              </span>
            </label>
          )}
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-muted">Calcul de ce qui sera repris…</p>
      )}
    </Modal>
  );
}

/** Banner of people that look keyed twice, with a one-click merge. */
export function PeopleDuplicatesBanner({ onPick }: { onPick: (pair: PeoplePair) => void }) {
  const { data = [] } = usePeopleDuplicates(true);
  const [open, setOpen] = useState(false);
  if (!data.length) return null;
  const shown = open ? data : data.slice(0, 4);
  return (
    <div className="rounded-2xl border border-accent/25 bg-peach/50 p-4">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0">
          <Users size={15} className="text-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-ink">
            {data.length} doublon{data.length > 1 ? 's' : ''} probable{data.length > 1 ? 's' : ''} (même nom à une faute près)
          </p>
          <div className="mt-3 space-y-1.5">
            {shown.map((d) => (
              <div key={`${d.drop.id}-${d.keep.id}`} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                <p className="min-w-0 flex-1 text-[12.5px] text-ink truncate">
                  <span className="text-muted">{ROLE_LABEL[d.role] ?? d.role} ·</span> <b>{d.drop.name}</b> <span className="text-muted">→</span> {d.keep.name}
                </p>
                <Button size="sm" variant="secondary" onClick={() => onPick({ source: d.drop, target: d.keep })}>
                  Fusionner
                </Button>
              </div>
            ))}
          </div>
          {data.length > 4 && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-[12.5px] font-semibold text-accent hover:underline">
              {open ? 'Voir moins' : `Voir les ${data.length - 4} autres`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pick, among the people of the same role, the record to merge with. */
export function PickPersonModal({ person, onClose, onPick }: { person: (PersonRef & { role: string }) | null; onClose: () => void; onPick: (pair: PeoplePair) => void }) {
  const [q, setQ] = useState('');
  const { data = [] } = useQuery({
    queryKey: ['users', 'merge-candidates', person?.role],
    queryFn: async () => {
      const r = await apiClient.get(`/users?role=${person!.role}&limit=500`);
      const d = r.data?.data ?? r.data;
      return ((d?.data ?? d) as { id: string; firstName: string; lastName: string }[]).map((u) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' ') }));
    },
    enabled: !!person,
  });
  if (!person) return null;
  const list = data.filter((u) => u.id !== person.id && u.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal open={!!person} onClose={onClose} title={`Fusionner « ${person.name} » avec…`} description="Choisissez l’autre fiche de la même personne." size="md">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un nom"
        className="w-full h-10 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink"
      />
      <div className="mt-3 max-h-72 overflow-y-auto divide-y divide-line rounded-xl border border-line">
        {list.length === 0 ? (
          <p className="p-3 text-[13px] text-muted">Aucune autre fiche de ce rôle.</p>
        ) : (
          list.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onPick({ source: person, target: u })}
              className="w-full text-left px-3 py-2.5 text-[13px] text-ink hover:bg-surface-2/60"
            >
              {u.name}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
