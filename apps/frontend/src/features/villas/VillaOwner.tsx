import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, UserRound, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { useExtrasOptions } from '../extras/api';

const NEW = '__new__';

/**
 * Owner of a villa: shown to everyone who can see the villa, chosen (or created)
 * by an administrator. The owner's share of the margin follows the villa.
 */
export function VillaOwnerPicker({ villa, className }: { villa: { id: string; ownerId?: string | null }; className?: string }) {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const { data: options } = useExtrasOptions();
  const owners = options?.owners ?? [];
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const current = owners.find((o) => o.id === villa.ownerId);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['villas'] });
    qc.invalidateQueries({ queryKey: ['villa'] });
    qc.invalidateQueries({ queryKey: ['extras'] });
  };

  const attach = async (ownerId: string | null, label?: string) => {
    setBusy(true);
    try {
      await apiClient.patch(`/extras/villas/${villa.id}`, { ownerId });
      toast.success(ownerId ? `Villa rattachée à ${label ?? owners.find((o) => o.id === ownerId)?.name ?? 'son propriétaire'}` : 'Propriétaire retiré');
      refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Rattachement impossible');
    } finally {
      setBusy(false);
    }
  };

  const createAndAttach = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const res = await apiClient.post('/extras/people', { role: 'OWNER', name: n });
      const id = (res.data?.data ?? res.data)?.id as string;
      await apiClient.patch(`/extras/villas/${villa.id}`, { ownerId: id });
      toast.success(`Propriétaire « ${n} » créé et rattaché`);
      setCreating(false);
      setName('');
      refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Création impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-[12.5px]', className)}>
      <span className="inline-flex items-center gap-1.5 text-muted">
        <UserRound size={14} /> Propriétaire
      </span>
      {!isAdmin ? (
        <span className="font-semibold text-ink">{current?.name ?? 'Non renseigné'}</span>
      ) : creating ? (
        <span className="flex flex-1 min-w-[220px] items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createAndAttach();
              if (e.key === 'Escape') setCreating(false);
            }}
            placeholder="Nom du propriétaire"
            maxLength={120}
            className="h-8 min-w-0 flex-1 rounded-full border border-line bg-surface px-3 text-ink"
          />
          <button
            type="button"
            onClick={createAndAttach}
            disabled={busy || !name.trim()}
            className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center disabled:opacity-40"
            aria-label="Créer et rattacher"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="w-8 h-8 rounded-full text-muted hover:text-ink hover:bg-surface-2 flex items-center justify-center"
            aria-label="Annuler"
          >
            <X size={14} />
          </button>
        </span>
      ) : (
        <select
          value={villa.ownerId ?? ''}
          disabled={busy}
          onChange={(e) => {
            if (e.target.value === NEW) setCreating(true);
            else attach(e.target.value || null);
          }}
          className="h-8 min-w-0 flex-1 rounded-full border border-line bg-surface px-3 text-ink"
          aria-label="Propriétaire de la villa"
        >
          <option value="">Aucun propriétaire</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value={NEW}>+ Nouveau propriétaire…</option>
        </select>
      )}
    </div>
  );
}
