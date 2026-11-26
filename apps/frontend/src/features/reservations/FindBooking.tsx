import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, CircleAlert, Plus, RefreshCw, Search } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { formatDay } from '../../lib/utils';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';

interface Found {
  id: string;
  guest: string;
  channel: string | null;
  checkIn: string | null;
  checkOut: string | null;
  lodgifyStatus: string;
  listing: { id: string; name: string };
  villa: { id: string; name: string } | null;
  inApp: boolean;
  reason: 'listing' | 'enquiry' | 'cancelled' | 'inactive' | null;
}

const WHY: Record<Exclude<Found['reason'], null>, string> = {
  listing: 'Faite sur une annonce Lodgify qui n’est pas dans l’appli : elle ne peut pas s’afficher.',
  enquiry: 'Demande ou devis dans Lodgify, pas une réservation : cochez « Demandes » pour la voir.',
  cancelled: 'Annulée dans Lodgify : cochez « Annulées » pour la voir.',
  inactive: 'La villa est désactivée : réactivez-la dans Villas pour voir ses séjours.',
};

/** "A booking is missing": search Lodgify by guest name and say why it is (not) shown. */
export function FindBooking({ open, onClose, onJump }: { open: boolean; onClose: () => void; onJump: (checkIn: string) => void }) {
  const qc = useQueryClient();
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(useAuthStore((s) => s.user?.role) ?? '');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [refresh, setRefresh] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching } = useQuery({
    queryKey: ['lodgify-find', q, refresh],
    enabled: open && q.length >= 2,
    queryFn: async () => {
      const r = await apiClient.get(`/lodgify/find?q=${encodeURIComponent(q)}${refresh ? '&refresh=true' : ''}`, { timeout: 60_000 });
      return (r.data?.data ?? r.data) as { results: Found[]; total: number; readAt: string | null };
    },
  });
  const add = useMutation({
    mutationFn: async (listingId: string) => (await apiClient.post('/lodgify/properties/import', { ids: [listingId] }, { timeout: 60_000 })).data,
    onSuccess: () => {
      toast.success('Annonce ajoutée : ses réservations s’affichent');
      qc.invalidateQueries({ queryKey: ['villas'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['lodgify-find'] });
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Une réservation manque ?" description="Cherchez le voyageur : l’appli dit où est sa réservation dans Lodgify et pourquoi elle n’apparaît pas." size="xl">
      <div className="space-y-4">
        <div className="flex gap-2">
          <label className="flex-1 flex items-center gap-2 h-10 px-3 rounded-xl border border-line bg-surface">
            <Search size={15} className="text-muted" />
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Nom du voyageur ou n° de réservation Lodgify" className="flex-1 bg-transparent outline-none text-[14px] text-ink" />
          </label>
          <Button variant="secondary" icon={<RefreshCw size={13} />} loading={isFetching && refresh} onClick={() => setRefresh((r) => !r)} title="Relire Lodgify maintenant">
            Relire Lodgify
          </Button>
        </div>

        {q.length >= 2 && !isFetching && data && data.results.length === 0 && (
          <p className="text-[13px] text-ink-soft">
            Aucune réservation à ce nom parmi les {data.total} lues dans Lodgify. Vérifiez l’orthographe, ou cliquez sur « Relire Lodgify » si elle vient d’être faite.
          </p>
        )}

        <ul className="space-y-2">
          {data?.results.map((b) => (
            <li key={b.id} className="rounded-2xl border border-line p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[14px] font-semibold text-ink">{b.guest}</p>
                <p className="text-[12.5px] text-ink-soft tabular">
                  {b.checkIn ? formatDay(b.checkIn) : '—'} → {b.checkOut ? formatDay(b.checkOut) : '—'}
                </p>
              </div>
              <p className="text-[12px] text-muted mt-0.5">
                {b.listing.name}
                {b.channel ? ` · ${b.channel}` : ''} · Lodgify n° {b.id} · {b.lodgifyStatus}
              </p>
              {b.reason ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="flex items-start gap-1.5 text-[12.5px] text-warning">
                    <CircleAlert size={14} className="shrink-0 mt-0.5" /> {WHY[b.reason]}
                  </p>
                  {b.reason === 'listing' && isAdmin && (
                    <Button size="sm" icon={<Plus size={13} />} loading={add.isPending && add.variables === b.listing.id} onClick={() => add.mutate(b.listing.id)}>
                      Ajouter « {b.listing.name} »
                    </Button>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="flex items-center gap-1.5 text-[12.5px] text-success">
                    <CheckCircle2 size={14} /> Sur le calendrier, ligne {b.villa?.name}
                    {!b.inApp && <span className="text-muted">(lue en direct, copiée à la prochaine lecture)</span>}
                  </p>
                  {b.checkIn && (
                    <button
                      type="button"
                      onClick={() => {
                        onJump(b.checkIn!);
                        onClose();
                      }}
                      className="text-[12.5px] font-semibold text-accent hover:underline"
                    >
                      Voir sur le calendrier →
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="text-[11.5px] text-muted">Lecture seule : rien n’est modifié dans Lodgify.</p>
      </div>
    </Modal>
  );
}
