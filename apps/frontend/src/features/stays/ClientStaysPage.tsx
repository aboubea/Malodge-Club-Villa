import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Building2, CalendarDays, Users, MapPin, Clock, Sparkles, BookOpen } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { GuideView, Booklet } from './GuideView';
import { RequestExtraModal, StayRef } from './RequestExtraModal';
import { activityKind } from '../calendar/agendaIcons';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { formatDate, formatCurrency } from '../../lib/utils';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  ACTIVE: 'En cours',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
};

const STATUS_VARIANT: Record<string, any> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

function nightsBetween(checkIn: string | null, checkOut: string | null) {
  if (!checkIn || !checkOut) return 0;
  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

interface ExtraRequest {
  id: string;
  status: string;
  scheduledAt: string | null;
  reservationId: string | null;
  total: number;
  currency: string;
  items: { name: string; category: string | null; quantity: number }[];
}

const REQUEST_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'À confirmer', tone: 'bg-peach text-ink' },
  CONFIRMED: { label: 'Confirmée', tone: 'bg-success/10 text-success' },
  IN_PROGRESS: { label: 'En cours', tone: 'bg-info/10 text-info' },
  COMPLETED: { label: 'Réalisée', tone: 'bg-surface-2 text-ink-soft' },
  CANCELLED: { label: 'Annulée', tone: 'bg-danger/10 text-danger' },
};

/** Extras asked for during one stay, with their status. */
function StayRequests({ requests }: { requests: ExtraRequest[] }) {
  if (!requests.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface divide-y divide-line">
      {requests.map((r) => {
        const first = r.items[0];
        const k = activityKind(first?.name, first?.category);
        const st = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.PENDING;
        return (
          <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className={cn('w-8 h-8 rounded-lg border flex items-center justify-center shrink-0', k.tone)}>
              <k.icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink truncate">
                {r.items.map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name)).join(', ')}
              </p>
              <p className="text-[12px] text-muted">
                {r.scheduledAt ? new Date(r.scheduledAt).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Date à convenir'} ·{' '}
                {formatCurrency(r.total, r.currency)}
              </p>
            </div>
            <span className={cn('h-6 px-2.5 rounded-full text-[11.5px] font-semibold inline-flex items-center shrink-0', st.tone)}>{st.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The villa's welcome booklet for one of the client's stays. */
function GuideModal({ stay, onClose }: { stay: StayRef | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['my-stay', 'guide', stay?.id],
    queryFn: async () => {
      const r = await apiClient.get('/my-stay/guide', { params: { reservationId: stay!.id } });
      return (r.data?.data ?? r.data) as { booklet: Booklet; villa: { name: string; mapsUrl: string | null } };
    },
    enabled: !!stay,
  });
  if (!stay) return null;
  return (
    <Modal open={!!stay} onClose={onClose} title={`Livret d’accueil${data ? ` — ${data.villa.name}` : ''}`} size="lg">
      {data ? <GuideView booklet={data.booklet} mapsUrl={data.villa.mapsUrl} /> : <p className="text-[13px] text-muted">Chargement…</p>}
    </Modal>
  );
}

export function ClientStaysPage() {
  const [requestFor, setRequestFor] = useState<StayRef | null>(null);
  const [guideFor, setGuideFor] = useState<StayRef | null>(null);
  const { data: requests = [] } = useQuery({
    queryKey: ['my-stay', 'requests'],
    queryFn: async () => {
      const r = await apiClient.get('/my-stay/requests');
      return (r.data?.data ?? r.data) as ExtraRequest[];
    },
    refetchInterval: 60_000,
  });
  const requestsOf = (stayId: string) => requests.filter((r) => r.reservationId === stayId);

  const { data, isLoading } = useQuery({
    queryKey: ['client-stays'],
    queryFn: async () => {
      const res = await apiClient.get('/reservations?limit=50');
      return res.data.data ?? res.data;
    },
  });

  const reservations: any[] = data?.data ?? data ?? [];

  // Stay dates are calendar days: compared as days (a stay ending today is still under way).
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const day = (d: string | null) => (d ? d.slice(0, 10) : null);
  const isActive = (r: any) => r.status !== 'CANCELLED' && !!day(r.checkIn) && !!day(r.checkOut) && day(r.checkIn)! <= today && day(r.checkOut)! >= today;
  const active = reservations.find((r) => r.status === 'ACTIVE' || isActive(r));
  // A stay whose dates are not known yet counts as upcoming, never as past.
  const upcoming = reservations
    .filter((r) => r !== active && (r.status === 'CONFIRMED' || r.status === 'PENDING') && (!day(r.checkIn) || day(r.checkIn)! > today))
    .sort((a, b) => (day(a.checkIn) ?? '9999').localeCompare(day(b.checkIn) ?? '9999'));
  const past = reservations.filter((r) => r !== active && !upcoming.includes(r));

  return (
    <div className="space-y-6 max-w-[900px]">
      <PageHeader title="Mon séjour" description="Vos séjours, et les extras à demander à l’équipe Malodge (transferts, chef, massages, excursions…)" />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : reservations.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 size={36} className="mx-auto text-line-strong mb-3" />
            <p className="text-sm text-muted">Aucun séjour enregistré</p>
            <p className="text-xs text-muted mt-1">Votre concierge vous assignera prochainement un séjour</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active stay */}
          {active && (
            <div>
              <h2 className="text-[12.5px] font-semibold text-muted mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                Séjour en cours
              </h2>
              <StayCard reservation={active} isCurrent onRequest={() => setRequestFor(active)} onGuide={() => setGuideFor(active)} />
              <StayRequests requests={requestsOf(active.id)} />
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-[12.5px] font-semibold text-muted mb-3 flex items-center gap-2">
                <Clock size={11} />
                À venir
              </h2>
              <div className="space-y-3">
                {upcoming.map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <StayCard reservation={r} onRequest={() => setRequestFor(r)} onGuide={() => setGuideFor(r)} />
                    <StayRequests requests={requestsOf(r.id)} />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Past stays */}
          {past.length > 0 && (
            <div>
              <h2 className="text-[12.5px] font-semibold text-muted mb-3">Séjours passés</h2>
              <div className="space-y-3">
                {past.map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <StayCard reservation={r} />
                    <StayRequests requests={requestsOf(r.id)} />
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <RequestExtraModal stay={requestFor} onClose={() => setRequestFor(null)} />
      <GuideModal stay={guideFor} onClose={() => setGuideFor(null)} />
    </div>
  );
}

function StayCard({ reservation: r, isCurrent, onRequest, onGuide }: {
  reservation: any;
  isCurrent?: boolean;
  onRequest?: () => void;
  onGuide?: () => void;
}) {
  const nights = nightsBetween(r.checkIn, r.checkOut);

  return (
    <Card className={isCurrent ? 'border-accent/30 bg-accent/5' : undefined}>
      <CardContent className="py-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Villa info */}
          <div className="flex gap-3 flex-1 min-w-0">
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-surface-2 border border-line shrink-0">
              {r.villa?.coverImage ? (
                <img src={r.villa.coverImage} alt={r.villa.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Building2 size={20} className="text-line-strong" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-medium text-ink">{r.villa?.name ?? 'Villa'}</h3>
                <Badge variant={STATUS_VARIANT[r.status] || 'default'} size="sm">
                  {STATUS_LABELS[r.status] ?? r.status}
                </Badge>
              </div>
              <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                <MapPin size={10} /> {r.villa?.city}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <CalendarDays size={10} />
                  {r.checkIn || r.checkOut ? `${formatDate(r.checkIn)} → ${formatDate(r.checkOut)}` : 'Dates à venir'}
                </span>
                {nights > 0 && <span>{nights} nuit{nights > 1 ? 's' : ''}</span>}
                <span className="flex items-center gap-1">
                  <Users size={10} /> {r.guests} voyageur{r.guests > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {r.totalAmount > 0 && (
              <p className="text-sm font-normal text-accent">{formatCurrency(r.totalAmount, r.currency ?? r.villa?.currency ?? 'EUR')}</p>
            )}
            {onGuide && (
              <Button variant="secondary" size="sm" icon={<BookOpen size={13} />} onClick={onGuide}>
                Livret
              </Button>
            )}
            {onRequest && (
              <Button variant={isCurrent ? 'primary' : 'secondary'} size="sm" icon={<Sparkles size={13} />} onClick={onRequest}>
                Demander un extra
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
