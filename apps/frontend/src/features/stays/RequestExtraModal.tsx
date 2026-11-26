import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Minus, Plus, Search, Send } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn, formatMoney } from '../../lib/utils';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { activityKind } from '../calendar/agendaIcons';

interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  price: number;
}
interface Catalogue {
  villa: { id: string; name: string } | null;
  currency: string;
  services: Service[];
}
export interface StayRef {
  id: string;
  checkIn: string | null;
  checkOut: string | null;
  villa?: { name: string } | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** First useful day: tomorrow, or the arrival day if the stay has not started. */
function defaultDay(stay: StayRef) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const arrival = stay.checkIn ? new Date(stay.checkIn.slice(0, 10) + 'T12:00:00') : null;
  return dateInput(arrival && arrival > tomorrow ? arrival : tomorrow);
}

/** The client asks for an extra for their stay; the team confirms it. */
export function RequestExtraModal({ stay, onClose }: { stay: StayRef | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Service | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [day, setDay] = useState('');
  const [time, setTime] = useState('10:00');
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-stay', 'catalogue', stay?.id],
    queryFn: async () => {
      const r = await apiClient.get('/my-stay/catalogue', { params: { reservationId: stay!.id } });
      return (r.data?.data ?? r.data) as Catalogue;
    },
    enabled: !!stay,
  });

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (data?.services ?? []).filter((s) => !needle || `${s.name} ${s.category ?? ''}`.toLowerCase().includes(needle));
    const map = new Map<string, Service[]>();
    for (const s of list) map.set(s.category ?? 'Autres', [...(map.get(s.category ?? 'Autres') ?? []), s]);
    return [...map.entries()];
  }, [data, q]);

  const close = () => {
    setPicked(null);
    setQ('');
    setQuantity(1);
    setNotes('');
    onClose();
  };

  const send = useMutation({
    mutationFn: () =>
      apiClient.post('/my-stay/requests', {
        reservationId: stay!.id,
        scheduledAt: new Date(`${day || defaultDay(stay!)}T${time || '10:00'}:00`).toISOString(),
        notes: notes.trim() || undefined,
        items: [{ serviceId: picked!.id, quantity }],
      }),
    onSuccess: () => {
      toast.success('Demande envoyée : l’équipe vous confirme très vite.');
      qc.invalidateQueries({ queryKey: ['my-stay', 'requests'] });
      close();
    },
  });

  if (!stay) return null;
  const currency = data?.currency ?? 'EUR';
  const min = dateInput(new Date());
  const max = stay.checkOut ? stay.checkOut.slice(0, 10) : undefined;

  return (
    <Modal open={!!stay} onClose={close} title={picked ? picked.name : 'Demander un extra'} description={picked ? undefined : `Pour votre séjour${stay.villa?.name ? ` à ${stay.villa.name}` : ''}`} size="lg">
      {!picked ? (
        <div className="space-y-4">
          <label className="relative block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Transfert, massage, chef, excursion…"
              className="w-full h-11 pl-9 pr-3 rounded-xl border border-line bg-surface text-[14px] text-ink focus:outline-none focus:ring-4 focus:ring-ink/5"
            />
          </label>
          {isLoading ? (
            <p className="text-[13px] text-muted">Chargement du catalogue…</p>
          ) : groups.length === 0 ? (
            <p className="text-[13px] text-muted">Aucune prestation trouvée.</p>
          ) : (
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
              {groups.map(([category, services]) => (
                <section key={category}>
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted mb-1.5">{category}</p>
                  <div className="space-y-1.5">
                    {services.map((s) => {
                      const k = activityKind(s.name, s.category);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setPicked(s);
                            setDay(defaultDay(stay));
                          }}
                          className="w-full flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left hover:border-line-strong hover:bg-surface-2/50"
                        >
                          <span className={cn('w-9 h-9 rounded-lg border flex items-center justify-center shrink-0', k.tone)}>
                            <k.icon size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold text-ink truncate">{s.name}</span>
                            {s.description && <span className="block text-[12px] text-muted truncate">{s.description}</span>}
                          </span>
                          <span className="text-[13px] font-semibold text-ink tabular shrink-0">
                            {formatMoney(s.price, currency)}
                            {s.unit && <span className="block text-right text-[11px] font-normal text-muted">/ {s.unit}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <button type="button" onClick={() => setPicked(null)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
            <ArrowLeft size={14} /> Autre prestation
          </button>
          {picked.description && <p className="text-[13px] text-ink-soft">{picked.description}</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12.5px] font-medium text-ink-soft">Jour</span>
              <input type="date" required min={min} max={max} value={day} onChange={(e) => setDay(e.target.value)} className="mt-1.5 w-full h-10 px-3 rounded-xl border border-line bg-surface text-[14px] text-ink" />
            </label>
            <label className="block">
              <span className="text-[12.5px] font-medium text-ink-soft">Heure souhaitée</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1.5 w-full h-10 px-3 rounded-xl border border-line bg-surface text-[14px] text-ink" />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-ink-soft">Quantité{picked.unit ? ` (${picked.unit})` : ''}</span>
            <div className="inline-flex items-center gap-2">
              <button type="button" onClick={() => setQuantity((n) => Math.max(1, n - 1))} className="w-9 h-9 rounded-full border border-line flex items-center justify-center" aria-label="Moins">
                <Minus size={14} />
              </button>
              <span className="w-8 text-center text-[15px] font-semibold tabular">{quantity}</span>
              <button type="button" onClick={() => setQuantity((n) => Math.min(50, n + 1))} className="w-9 h-9 rounded-full border border-line flex items-center justify-center" aria-label="Plus">
                <Plus size={14} />
              </button>
            </div>
          </div>
          <label className="block">
            <span className="text-[12.5px] font-medium text-ink-soft">Précisions (optionnel)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Numéro de vol, nombre de personnes, allergies…"
              className="mt-1.5 w-full px-3 py-2 rounded-xl border border-line bg-surface text-[14px] text-ink"
            />
          </label>
          <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
            <span className="text-[13px] text-ink-soft">Prix indicatif</span>
            <span className="text-[16px] font-bold text-ink tabular">{formatMoney(picked.price * quantity, currency)}</span>
          </div>
          <p className="text-[12px] text-muted">L’équipe Malodge confirme la disponibilité et le prix avant la prestation. Rien n’est débité maintenant.</p>
          <Button type="submit" icon={<Send size={14} />} loading={send.isPending} className="w-full">
            Envoyer la demande
          </Button>
        </form>
      )}
    </Modal>
  );
}
