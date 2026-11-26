import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, CheckCircle2, Clock, Download, MapPin, MessageSquareText, RefreshCw, Users, Wallet, X } from 'lucide-react';
import { Logo } from '../../components/brand/Logo';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../lib/apiClient';
import { cn, formatMoney } from '../../lib/utils';
import { activityKind } from '../calendar/agendaIcons';

/** The personal link's key, kept on the phone so the home-screen icon opens the space directly. */
const KEY = 'malodge.provider.key';
const readKey = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Requests with the personal key (no session, no redirection to the login page). */
const keyApi = axios.create({ baseURL: '/api', timeout: 30_000 });
keyApi.interceptors.request.use((config) => {
  const k = readKey();
  if (k) config.headers['X-Provider-Key'] = k;
  return config;
});

interface Mission {
  id: string;
  date: string | null;
  status: string;
  providerStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  items: { label: string; category: string | null; quantity: number }[];
  amount: number | null;
  currency: string;
  villa: { name: string; city: string; address: string; mapsUrl: string | null } | null;
  guest: string | null;
  guests: number | null;
  notes: string | null;
  canRespond: boolean;
  canComplete: boolean;
}
interface Overview {
  provider: { firstName: string };
  missions: Mission[];
  account: {
    balances: { currency: string; due: number; paid: number; balance: number; state: string }[];
    payments: { date: string | null; label: string; amount: number; currency: string; method: string | null }[];
  };
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
function dayLabel(iso: string | null) {
  if (!iso) return 'Date à confirmer';
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (dayKey(d) === dayKey(today)) return 'Aujourd’hui';
  if (dayKey(d) === dayKey(tomorrow)) return 'Demain';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
/** Dates imported without a time are stored at 00:00 UTC: no time shown then. */
const timeOf = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return null;
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'À confirmer', tone: 'bg-peach text-ink' },
  ACCEPTED: { label: 'Acceptée', tone: 'bg-success/10 text-success' },
  REJECTED: { label: 'Refusée', tone: 'bg-danger/10 text-danger' },
  DONE: { label: 'Réalisée', tone: 'bg-surface-2 text-ink-soft' },
};

/** The page as an app on the phone's home screen (manifest + icons). */
function useInstallable() {
  const [prompt, setPrompt] = useState<any>(null);
  useEffect(() => {
    const added: HTMLElement[] = [];
    const add = (tag: string, attrs: Record<string, string>) => {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
      added.push(el);
    };
    add('link', { rel: 'manifest', href: '/manifest-prestataire.webmanifest' });
    add('link', { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Malodge' });
    add('meta', { name: 'theme-color', content: '#1C1D29' });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      added.forEach((el) => el.remove());
    };
  }, []);
  return prompt;
}

function MissionCard({ m, onRespond, onDone, busy }: { m: Mission; onRespond: (a: 'accept' | 'reject') => void; onDone: () => void; busy: boolean }) {
  const first = m.items[0];
  const kind = activityKind(first?.label, first?.category);
  const time = timeOf(m.date);
  const st = m.status === 'COMPLETED' ? STATUS.DONE : STATUS[m.providerStatus] ?? STATUS.PENDING;
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className={cn('w-11 h-11 rounded-xl border flex items-center justify-center shrink-0', kind.tone)}>
          <kind.icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-ink first-letter:uppercase">{dayLabel(m.date)}</span>
            {time && (
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
                <Clock size={13} /> {time}
              </span>
            )}
            <span className={cn('ml-auto h-6 px-2.5 rounded-full text-[11.5px] font-semibold inline-flex items-center', st.tone)}>{st.label}</span>
          </div>
          {m.items.map((i, k) => (
            <p key={k} className="text-[15px] font-bold text-ink leading-snug mt-0.5">
              {i.label}
              {i.quantity > 1 && <span className="font-semibold text-muted"> × {i.quantity}</span>}
            </p>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 text-[13.5px] text-ink-soft">
        {m.villa && (
          <p className="flex items-start gap-2">
            <MapPin size={15} className="shrink-0 mt-0.5 text-muted" />
            <span>
              <b className="text-ink">{m.villa.name}</b>
              {m.villa.city ? ` · ${m.villa.city}` : ''}
              {m.villa.mapsUrl && (
                <a href={m.villa.mapsUrl} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-accent">
                  Itinéraire
                </a>
              )}
            </span>
          </p>
        )}
        {(m.guest || m.guests) && (
          <p className="flex items-center gap-2">
            <Users size={15} className="shrink-0 text-muted" />
            {m.guest}
            {m.guests ? ` · ${m.guests} pers.` : ''}
          </p>
        )}
        {m.notes && (
          <p className="flex items-start gap-2">
            <MessageSquareText size={15} className="shrink-0 mt-0.5 text-muted" />
            <span className="whitespace-pre-line">{m.notes}</span>
          </p>
        )}
        <p className="flex items-center gap-2">
          <Wallet size={15} className="shrink-0 text-muted" />
          {m.amount != null ? (
            <span>
              Votre tarif : <b className="text-ink">{formatMoney(m.amount, m.currency)}</b>
            </span>
          ) : (
            <span className="text-muted">Tarif à confirmer avec Malodge</span>
          )}
        </p>
      </div>

      {m.canRespond && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Refuser cette mission ? Malodge cherchera quelqu’un d’autre.')) onRespond('reject');
            }}
            className="h-11 rounded-xl border border-line-strong text-[14px] font-semibold text-ink inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <X size={16} /> Refuser
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond('accept')}
            className="h-11 rounded-xl bg-primary text-on-primary text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Check size={16} /> Accepter
          </button>
        </div>
      )}
      {m.canComplete && (
        <button
          type="button"
          disabled={busy}
          onClick={onDone}
          className="w-full h-11 rounded-xl bg-success text-white text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <CheckCircle2 size={16} /> Mission réalisée
        </button>
      )}
    </article>
  );
}

/** Provider space, on the phone: missions to accept and do, and payments. */
export function ProviderSpacePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useAuthStore((s) => s.accessToken);
  const installPrompt = useInstallable();
  const [tab, setTab] = useState<'next' | 'past' | 'pay'>('next');

  // A link opened from WhatsApp: the key is kept on the phone, and taken out of the address bar.
  useEffect(() => {
    if (!token) return;
    try {
      localStorage.setItem(KEY, token);
    } catch {
      /* private browsing: the link has to be opened each time */
    }
    navigate('/prestataire', { replace: true });
  }, [token, navigate]);

  const hasKey = !!(token || readKey());
  const api = hasKey ? keyApi : apiClient;
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['provider-space', hasKey],
    queryFn: async () => {
      const r = await api.get('/provider-space/me');
      return (r.data?.data ?? r.data) as Overview;
    },
    enabled: hasKey || !!session,
    refetchInterval: 60_000,
    retry: false,
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' | 'done' }) =>
      action === 'done' ? api.post(`/provider-space/missions/${id}/done`) : api.post(`/provider-space/missions/${id}/respond`, { action }),
    onSuccess: (_r, v) => {
      toast.success(v.action === 'accept' ? 'Mission acceptée' : v.action === 'reject' ? 'Mission refusée' : 'Mission notée comme réalisée');
      qc.invalidateQueries({ queryKey: ['provider-space'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Action impossible, réessayez'),
  });

  const { next, past } = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const list = data?.missions ?? [];
    const isPast = (m: Mission) => m.status === 'COMPLETED' || m.providerStatus === 'REJECTED' || (!!m.date && new Date(m.date) < startOfToday && !m.canComplete);
    return { next: list.filter((m) => !isPast(m)), past: list.filter(isPast).reverse() };
  }, [data]);
  const toAnswer = next.filter((m) => m.canRespond).length;

  const expired = (error as any)?.response?.status === 401 || (!hasKey && !session);
  const shown = tab === 'next' ? next : past;

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <div className="max-w-md mx-auto px-4 pb-10">
        <header className="flex items-center justify-between py-4">
          <Logo size="sm" />
          {data && (
            <button type="button" onClick={() => refetch()} className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-ink" aria-label="Actualiser">
              <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
            </button>
          )}
        </header>

        {expired ? (
          <div className="mt-10 rounded-2xl border border-line bg-surface p-6 text-center space-y-3">
            <p className="text-[17px] font-bold text-ink">Lien expiré ou désactivé</p>
            <p className="text-[14px] text-ink-soft">
              {(error as any)?.response?.data?.message || 'Ouvrez le lien personnel reçu par WhatsApp, ou demandez-en un nouveau à Malodge.'}
            </p>
            <Link to="/login" className="inline-block text-[14px] font-semibold text-accent">
              J’ai un compte : me connecter
            </Link>
          </div>
        ) : isLoading || !data ? (
          <div className="space-y-3 mt-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 rounded-2xl bg-surface-2 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <h1 className="text-[22px] font-bold text-ink">Bonjour {data.provider.firstName}</h1>
            <p className="text-[14px] text-ink-soft mt-0.5">
              {toAnswer ? `${toAnswer} mission${toAnswer > 1 ? 's' : ''} à confirmer` : next.length ? `${next.length} mission${next.length > 1 ? 's' : ''} à venir` : 'Aucune mission à venir pour l’instant'}
            </p>

            {installPrompt && (
              <button
                type="button"
                onClick={async () => {
                  installPrompt.prompt();
                }}
                className="mt-3 w-full h-11 rounded-xl border border-line-strong bg-surface text-[14px] font-semibold text-ink inline-flex items-center justify-center gap-2"
              >
                <Download size={16} /> Installer sur mon téléphone
              </button>
            )}

            <nav className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
              {(
                [
                  ['next', `À venir${next.length ? ` (${next.length})` : ''}`],
                  ['past', 'Passées'],
                  ['pay', 'Règlements'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={cn('h-10 rounded-lg text-[13.5px] font-semibold', tab === k ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft')}
                >
                  {label}
                </button>
              ))}
            </nav>

            {tab === 'pay' ? (
              <section className="mt-4 space-y-3">
                {data.account.balances.length === 0 ? (
                  <p className="text-[14px] text-muted mt-6 text-center">Rien à régler pour l’instant.</p>
                ) : (
                  data.account.balances.map((b) => (
                    <div key={b.currency} className="rounded-2xl border border-line bg-surface p-4">
                      <p className="text-[13px] text-muted">Reste à vous payer</p>
                      <p className="text-[26px] font-bold text-ink tabular">{formatMoney(b.balance, b.currency)}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
                        <p className="text-ink-soft">
                          Missions : <b className="text-ink">{formatMoney(b.due, b.currency)}</b>
                        </p>
                        <p className="text-ink-soft">
                          Déjà réglé : <b className="text-ink">{formatMoney(b.paid, b.currency)}</b>
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {data.account.payments.length > 0 && (
                  <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
                    {data.account.payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3 text-[13.5px]">
                        <span className="text-ink-soft">
                          {p.date ? new Date(p.date).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '—'} · {p.label}
                        </span>
                        <b className="text-ink tabular">{formatMoney(p.amount, p.currency)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : shown.length === 0 ? (
              <p className="text-[14px] text-muted mt-10 text-center">{tab === 'next' ? 'Aucune mission à venir.' : 'Aucune mission ces 30 derniers jours.'}</p>
            ) : (
              <section className="mt-4 space-y-3">
                {shown.map((m) => (
                  <MissionCard
                    key={m.id}
                    m={m}
                    busy={act.isPending && act.variables?.id === m.id}
                    onRespond={(action) => act.mutate({ id: m.id, action })}
                    onDone={() => act.mutate({ id: m.id, action: 'done' })}
                  />
                ))}
              </section>
            )}

            {!installPrompt && (
              <p className="mt-8 text-[12.5px] text-muted text-center">
                Astuce : ajoutez cette page à l’écran d’accueil (iPhone : Partager › Sur l’écran d’accueil · Android : menu ⋮ › Ajouter à l’écran d’accueil).
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

