import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarDays, Users, MapPin, Clock, ShoppingBag } from 'lucide-react';
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

function nightsBetween(checkIn: string, checkOut: string) {
  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export function ClientStaysPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['client-stays'],
    queryFn: async () => {
      const res = await apiClient.get('/reservations?limit=50');
      return res.data.data ?? res.data;
    },
  });

  const reservations: any[] = data?.data ?? data ?? [];

  const now = new Date();
  const active = reservations.find(
    (r) => r.status === 'ACTIVE' || (r.status === 'CONFIRMED' && new Date(r.checkIn) <= now && new Date(r.checkOut) >= now),
  );
  const upcoming = reservations
    .filter((r) => (r.status === 'CONFIRMED' || r.status === 'PENDING') && new Date(r.checkIn) > now)
    .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());
  const past = reservations.filter(
    (r) => r.status === 'COMPLETED' || r.status === 'CANCELLED' || new Date(r.checkOut) < now,
  );

  return (
    <div className="space-y-6 max-w-[900px]">
      <PageHeader title="Mes séjours" description="Historique et séjours à venir" />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : reservations.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 size={36} className="mx-auto text-[#242428] mb-3" />
            <p className="text-sm text-[#6B6B6F]">Aucun séjour enregistré</p>
            <p className="text-xs text-[#3A3A3E] mt-1">Votre concierge vous assignera prochainement un séjour</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active stay */}
          {active && (
            <div>
              <h2 className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Séjour en cours
              </h2>
              <StayCard reservation={active} isCurrent onOrderServices={() => navigate('/catalogue')} />
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider mb-3 flex items-center gap-2">
                <Clock size={11} />
                À venir
              </h2>
              <div className="space-y-3">
                {upcoming.map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <StayCard reservation={r} onOrderServices={() => navigate('/catalogue')} />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Past stays */}
          {past.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider mb-3">Séjours passés</h2>
              <div className="space-y-3">
                {past.map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <StayCard reservation={r} />
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StayCard({ reservation: r, isCurrent, onOrderServices }: {
  reservation: any;
  isCurrent?: boolean;
  onOrderServices?: () => void;
}) {
  const nights = nightsBetween(r.checkIn, r.checkOut);
  const ordersCount = r.orders?.length ?? 0;

  return (
    <Card className={isCurrent ? 'border-[#C9A96E]/30 bg-[#C9A96E]/5' : undefined}>
      <CardContent className="py-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Villa info */}
          <div className="flex gap-3 flex-1 min-w-0">
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-[#1A1A1D] border border-[#242428] shrink-0">
              {r.villa?.coverImage ? (
                <img src={r.villa.coverImage} alt={r.villa.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Building2 size={20} className="text-[#242428]" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-medium text-[#F5F0EB]">{r.villa?.name ?? 'Villa'}</h3>
                <Badge variant={STATUS_VARIANT[r.status] || 'default'} size="sm">
                  {STATUS_LABELS[r.status] ?? r.status}
                </Badge>
              </div>
              <p className="text-xs text-[#6B6B6F] mt-0.5 flex items-center gap-1">
                <MapPin size={10} /> {r.villa?.city}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-[#6B6B6F]">
                <span className="flex items-center gap-1">
                  <CalendarDays size={10} />
                  {formatDate(r.checkIn)} → {formatDate(r.checkOut)}
                </span>
                <span>{nights} nuit{nights > 1 ? 's' : ''}</span>
                <span className="flex items-center gap-1">
                  <Users size={10} /> {r.guests} voyageur{r.guests > 1 ? 's' : ''}
                </span>
              </div>
              {ordersCount > 0 && (
                <p className="text-[11px] text-[#6B6B6F] mt-1 flex items-center gap-1">
                  <ShoppingBag size={10} /> {ordersCount} service{ordersCount > 1 ? 's' : ''} commandé{ordersCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {r.totalAmount && (
              <p className="text-sm font-light text-[#C9A96E]">{formatCurrency(r.totalAmount)}</p>
            )}
            {onOrderServices && isCurrent && (
              <Button variant="primary" size="sm" onClick={onOrderServices}>
                Commander des services
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
