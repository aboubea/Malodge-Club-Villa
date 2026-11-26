import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarDays, Home, MessageCircle, Navigation, Sparkles, Users } from 'lucide-react';
import { Logo } from '../../components/brand/Logo';
import { cn, formatMoney } from '../../lib/utils';
import { activityKind } from '../calendar/agendaIcons';
import { Booklet, GuideView } from './GuideView';
import { Catalogue, RequestBody, RequestExtraModal } from './RequestExtraModal';

/** The guest's personal link key, kept on the phone so the space reopens without the link. */
const KEY = 'malodge.stay.key';
const readKey = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const stayApi = axios.create({ baseURL: '/api', timeout: 30_000 });
stayApi.interceptors.request.use((config) => {
  const k = readKey();
  if (k) config.headers['X-Stay-Key'] = k;
  return config;
});

interface View {
  guest: { firstName: string };
  stay: { id: string; checkIn: string | null; checkOut: string | null; nights: number | null; guests: number | null };
  villa: { name: string; city: string; coverImage: string | null; mapsUrl: string | null };
  booklet: Booklet;
  catalogue: Catalogue;
  requests: { id: string; status: string; scheduledAt: string | null; total: number; currency: string; items: { name: string; category: string | null; quantity: number }[] }[];
}

const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'À confirmer', tone: 'bg-peach text-ink' },
  CONFIRMED: { label: 'Confirmée', tone: 'bg-success/10 text-success' },
  IN_PROGRESS: { label: 'En cours', tone: 'bg-info/10 text-info' },
  COMPLETED: { label: 'Réalisée', tone: 'bg-surface-2 text-ink-soft' },
  CANCELLED: { label: 'Annulée', tone: 'bg-danger/10 text-danger' },
};
const longDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '—');

/** Guest stay space: welcome, the villa's booklet and services, their requests. */
export function GuestStayPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'home' | 'guide' | 'services'>('home');
  const [asking, setAsking] = useState(false);

  // The link from the e-mail or WhatsApp: the key is kept on the phone, and leaves the address bar.
  useEffect(() => {
    if (!token) return;
    try {
      localStorage.setItem(KEY, token);
    } catch {
      /* private browsing: the link has to be opened each time */
    }
    navigate('/sejour', { replace: true });
  }, [token, navigate]);

  const hasKey = !!(token || readKey());
  const { data, error, isLoading } = useQuery({
    queryKey: ['stay-space', hasKey],
    queryFn: async () => {
      const r = await stayApi.get('/stay-space/me');
      return (r.data?.data ?? r.data) as View;
    },
    enabled: hasKey,
    retry: false,
    refetchInterval: 60_000,
  });

  if (!hasKey || error) {
    return (
      <div className="min-h-[100dvh] bg-canvas flex flex-col items-center justify-center p-6 text-center">
        <Logo size="md" />
        <p className="mt-8 text-[17px] font-bold text-ink">Lien expiré ou incomplet</p>
        <p className="mt-2 max-w-sm text-[14px] text-ink-soft">{(error as any)?.response?.data?.message || 'Ouvrez le lien reçu par e-mail ou WhatsApp, ou demandez-en un nouveau à votre conciergerie.'}</p>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="min-h-[100dvh] bg-canvas p-4 max-w-md mx-auto space-y-3">
        <div className="h-48 rounded-3xl bg-surface-2 animate-pulse" />
        <div className="h-24 rounded-2xl bg-surface-2 animate-pulse" />
      </div>
    );
  }

  const contact = data.booklet.guide.contactPhone;
  const services = data.catalogue.services;

  return (
    <div className="min-h-[100dvh] bg-canvas pb-24">
      <div className="max-w-md mx-auto">
        <header className="flex items-center justify-between px-4 py-4">
          <Logo size="sm" />
        </header>

        <div className="px-4">
          <div className="relative rounded-3xl overflow-hidden bg-primary text-on-primary">
            {data.villa.coverImage && <img src={data.villa.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-45" />}
            <div className="relative p-5 pt-16">
              <p className="text-[14px] text-on-primary/90">Bienvenue {data.guest.firstName}</p>
              <h1 className="text-[26px] font-bold leading-tight text-on-primary">{data.villa.name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-on-primary/90">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays size={13} /> {longDay(data.stay.checkIn)} → {longDay(data.stay.checkOut)}
                </span>
                {data.stay.guests ? (
                  <span className="inline-flex items-center gap-1">
                    <Users size={13} /> {data.stay.guests} pers.
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 mt-4">
          {tab === 'home' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {data.villa.mapsUrl && (
                  <a href={data.villa.mapsUrl} target="_blank" rel="noreferrer" className="h-12 rounded-2xl border border-line bg-surface inline-flex items-center justify-center gap-2 text-[14px] font-semibold text-ink">
                    <Navigation size={16} /> Itinéraire
                  </a>
                )}
                {contact && (
                  <a href={`https://wa.me/${contact.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="h-12 rounded-2xl bg-success text-white inline-flex items-center justify-center gap-2 text-[14px] font-semibold">
                    <MessageCircle size={16} /> Nous écrire
                  </a>
                )}
              </div>
              {(data.booklet.guide.checkInTime || data.booklet.guide.checkOutTime) && (
                <div className="rounded-2xl border border-line bg-surface p-4 grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <p className="text-muted">Arrivée</p>
                    <p className="font-bold text-ink">{data.booklet.guide.checkInTime ? `dès ${data.booklet.guide.checkInTime}` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted">Départ</p>
                    <p className="font-bold text-ink">{data.booklet.guide.checkOutTime ? `avant ${data.booklet.guide.checkOutTime}` : '—'}</p>
                  </div>
                </div>
              )}
              {services.length > 0 && (
                <button type="button" onClick={() => setAsking(true)} className="w-full rounded-2xl bg-primary text-on-primary p-4 text-left">
                  <p className="flex items-center gap-2 text-[15px] font-bold">
                    <Sparkles size={17} /> Réserver un extra
                  </p>
                  <p className="text-[13px] opacity-85 mt-0.5">Transfert, chef à domicile, massage, activités… confirmés par l’équipe.</p>
                </button>
              )}
              <section>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">Mes demandes</p>
                {data.requests.length === 0 ? (
                  <p className="text-[13.5px] text-muted">Aucune demande pour l’instant.</p>
                ) : (
                  <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
                    {data.requests.map((r) => {
                      const k = activityKind(r.items[0]?.name, r.items[0]?.category);
                      const st = STATUS[r.status] ?? STATUS.PENDING;
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                          <span className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', k.tone)}>
                            <k.icon size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-semibold text-ink truncate">{r.items.map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name)).join(', ')}</p>
                            <p className="text-[12px] text-muted">
                              {r.scheduledAt ? new Date(r.scheduledAt).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Date à convenir'} · {formatMoney(r.total, r.currency)}
                            </p>
                          </div>
                          <span className={cn('h-6 px-2.5 rounded-full text-[11.5px] font-semibold inline-flex items-center shrink-0', st.tone)}>{st.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === 'guide' && <GuideView booklet={data.booklet} mapsUrl={data.villa.mapsUrl} />}

          {tab === 'services' && (
            <div className="space-y-2">
              {services.length === 0 ? (
                <p className="text-[14px] text-muted">Les services de la villa arrivent bientôt : contactez votre conciergerie.</p>
              ) : (
                <>
                  {services.map((s) => {
                    const k = activityKind(s.name, s.category);
                    return (
                      <button key={s.id} type="button" onClick={() => setAsking(true)} className="w-full flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3 text-left">
                        <span className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', k.tone)}>
                          <k.icon size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-semibold text-ink">{s.name}</span>
                          {s.description && <span className="block text-[12.5px] text-muted line-clamp-2">{s.description}</span>}
                        </span>
                        <span className="text-[13.5px] font-bold text-ink tabular shrink-0">{formatMoney(s.price, data.catalogue.currency)}</span>
                      </button>
                    );
                  })}
                  <p className="text-[12px] text-muted text-center pt-2">Prix indicatifs, confirmés par l’équipe. Rien n’est débité en ligne.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom navigation, like an app */}
      <nav className="fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-md mx-auto grid grid-cols-3">
          {(
            [
              ['home', 'Mon séjour', Home],
              ['guide', 'Livret', BookOpen],
              ['services', 'Services', Sparkles],
            ] as const
          ).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn('h-14 flex flex-col items-center justify-center gap-0.5 text-[11.5px] font-semibold', tab === k ? 'text-accent' : 'text-muted')}>
              <Icon size={19} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <RequestExtraModal
        stay={asking ? { id: data.stay.id, checkIn: data.stay.checkIn, checkOut: data.stay.checkOut, villa: { name: data.villa.name } } : null}
        onClose={() => setAsking(false)}
        catalogue={data.catalogue}
        sendRequest={(body: RequestBody) => stayApi.post('/stay-space/requests', { scheduledAt: body.scheduledAt, notes: body.notes, items: body.items })}
        onSent={() => qc.invalidateQueries({ queryKey: ['stay-space'] })}
      />
    </div>
  );
}
