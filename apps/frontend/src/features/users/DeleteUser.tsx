import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Ban, Merge, Trash2, UserX } from 'lucide-react';
import { useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface Check {
  id: string;
  name: string;
  role: string;
  canDelete: boolean;
  refused: string | null;
  blockers: string[];
  rules: number;
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of [['users'], ['people-duplicates'], ['empty-clients']]) qc.invalidateQueries({ queryKey: k });
};

/**
 * Deleting a person: the server says first whether it is possible. A person with
 * history (stays, extras, payments…) is merged into the right record or switched off.
 */
export function DeleteUserModal({
  user,
  onClose,
  onMerge,
  onDeactivate,
}: {
  user: { id: string; firstName: string; lastName: string; role: string; isActive: boolean } | null;
  onClose: () => void;
  onMerge?: (u: { id: string; name: string; role: string }) => void;
  onDeactivate?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { data: check, isLoading } = useQuery({
    queryKey: ['user-delete-check', user?.id],
    queryFn: async () => {
      const r = await apiClient.get(`/users/${user!.id}/delete-check`);
      return (r.data?.data ?? r.data) as Check;
    },
    enabled: !!user,
    retry: false,
  });
  const remove = useMutation({
    mutationFn: async () => (await apiClient.delete(`/users/${user!.id}`)).data,
    onSuccess: () => {
      toast.success(`${check?.name ?? 'Fiche'} supprimée`);
      invalidate(qc);
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Suppression impossible'),
  });
  if (!user) return null;
  const name = check?.name ?? `${user.firstName} ${user.lastName}`.trim();
  const mergeable = ['CLIENT', 'PROVIDER', 'OWNER', 'EMPLOYEE'].includes(user.role);

  return (
    <Modal open={!!user} onClose={onClose} title={`Supprimer « ${name} » ?`} size="md">
      {isLoading || !check ? (
        <div className="h-20 rounded-xl bg-surface-2 animate-pulse" />
      ) : check.refused ? (
        <p className="flex items-start gap-2 text-[13.5px] text-ink-soft">
          <Ban size={16} className="shrink-0 mt-0.5 text-danger" /> {check.refused}
        </p>
      ) : check.canDelete ? (
        <div className="space-y-4">
          <p className="text-[13.5px] text-ink-soft">
            Aucun séjour, extra, règlement ni relevé : la fiche sera supprimée définitivement.
            {check.rules > 0 && ` Ses ${check.rules} règle(s) de commission partent avec elle.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="destructive" icon={<Trash2 size={14} />} loading={remove.isPending} onClick={() => remove.mutate()}>
              Supprimer
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13.5px] text-ink-soft">
            <b className="text-ink">{name}</b> a un historique : <b className="text-ink">{check.blockers.join(', ')}</b>. La supprimer effacerait ces chiffres, elle est donc gardée.
          </p>
          <ul className="space-y-1.5 text-[13px] text-ink-soft">
            {mergeable && <li>· C’est un doublon ? Fusionnez-la avec la bonne fiche : tout son historique y passe.</li>}
            <li>· Elle ne doit plus apparaître ni se connecter ? Désactivez-la.</li>
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            {user.isActive && onDeactivate && (
              <Button
                variant="secondary"
                icon={<UserX size={14} />}
                onClick={() => {
                  onDeactivate(user.id);
                  onClose();
                }}
              >
                Désactiver
              </Button>
            )}
            {mergeable && onMerge && (
              <Button
                icon={<Merge size={14} />}
                onClick={() => {
                  onMerge({ id: user.id, name, role: user.role });
                  onClose();
                }}
              >
                Fusionner…
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Client records left empty (no stay, extra or payment, no access): removed in one click. */
export function EmptyClientsBanner() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['empty-clients'],
    queryFn: async () => {
      const r = await apiClient.get('/users/empty-clients');
      return (r.data?.data ?? r.data) as { count: number; people: { id: string; name: string }[] };
    },
  });
  const clean = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post('/users/empty-clients/delete');
      return (r.data?.data ?? r.data) as { deleted: number };
    },
    onSuccess: (d) => {
      toast.success(`${d.deleted} fiche${d.deleted > 1 ? 's' : ''} vide${d.deleted > 1 ? 's' : ''} supprimée${d.deleted > 1 ? 's' : ''}`);
      invalidate(qc);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Suppression impossible'),
  });
  if (!data?.count) return null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
          <UserX size={15} className="text-ink-soft" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-ink">
            {data.count} fiche{data.count > 1 ? 's' : ''} client vide{data.count > 1 ? 's' : ''}
          </p>
          <p className="text-[12.5px] text-muted">Jamais réservé, aucun extra ni règlement, pas d’accès à l’appli : des restes de demandes Lodgify.</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-[12.5px] font-semibold text-accent hover:underline">
          {open ? 'Masquer' : 'Voir'}
        </button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Trash2 size={13} />}
          loading={clean.isPending}
          onClick={() => {
            if (confirm(`Supprimer les ${data.count} fiches client vides ? Aucun séjour, extra ni règlement n’est touché.`)) clean.mutate();
          }}
        >
          Supprimer les fiches vides
        </Button>
      </div>
      {open && <p className="mt-3 text-[12.5px] text-ink-soft leading-relaxed">{data.people.map((p) => p.name).join(' · ')}</p>}
    </div>
  );
}
