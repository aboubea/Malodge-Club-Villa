import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, Copy, Mail, MessageCircle, Send, ShieldOff, TriangleAlert, UserPlus } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';

type Step = 'welcome' | 'j7' | 'j1' | 'thanks';
export interface StayAccess {
  url: string;
  invitedAt: string | null;
  journey: Partial<Record<Step, { at: string; channel: string }>>;
  nextStep: Step | null;
  contact: { email: string | null; emailKind: 'real' | 'relay' | 'none'; phone: string | null };
  whatsappUrl: string | null;
  messageText: string;
  villa: { id: string; name: string };
  guideReady: boolean;
  autoMessages: boolean;
  servicesCount: number;
  cancelled: boolean;
  email?: { sent: boolean; error?: string } | null;
}

export const STEP_LABEL: Record<Step, string> = { welcome: 'Bienvenue', j7: 'J-7 extras', j1: 'J-1 arrivée', thanks: 'Merci' };
const CHANNEL: Record<string, string> = { email: 'e-mail', auto: 'e-mail auto', whatsapp: 'WhatsApp', airbnb: 'Airbnb', manual: 'à la main' };

/** The journey's four messages, with when and how each went out. */
export function JourneyChips({ journey, next }: { journey: StayAccess['journey']; next: Step | null }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(STEP_LABEL) as Step[]).map((k) => {
        const done = journey[k];
        return (
          <span
            key={k}
            title={done ? `Envoyé le ${new Date(done.at).toLocaleDateString('fr-FR')} (${CHANNEL[done.channel] ?? done.channel})` : undefined}
            className={cn(
              'h-6 px-2 rounded-full text-[11px] font-semibold inline-flex items-center gap-1',
              done ? 'bg-success/10 text-success' : next === k ? 'bg-peach text-ink ring-1 ring-accent/40' : 'bg-surface-2 text-muted',
            )}
          >
            {done && <CheckCircle2 size={11} />}
            {STEP_LABEL[k]}
          </span>
        );
      })}
    </div>
  );
}

/** Invite the guest of this booking to their stay space (booklet + the villa's services). */
export function StayInvitePanel({ stayId }: { stayId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['stay-access', stayId],
    queryFn: async () => {
      const r = await apiClient.get(`/stays/${stayId}/access`);
      return (r.data?.data ?? r.data) as StayAccess;
    },
  });
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  useEffect(() => {
    if (!data) return;
    setEmail(data.contact.email ?? '');
    setPhone(data.contact.phone ?? '');
  }, [data?.contact.email, data?.contact.phone]);

  const done = (d: StayAccess) => {
    qc.setQueryData(['stay-access', stayId], d);
    qc.invalidateQueries({ queryKey: ['stays-onboarding'] });
  };
  const invite = useMutation({
    mutationFn: async (sendEmail: boolean) => (await apiClient.post(`/stays/${stayId}/invite`, { email: email.trim() || undefined, phone: phone.trim(), sendEmail })).data,
    onSuccess: (r) => {
      const d = (r?.data ?? r) as StayAccess;
      done(d);
      if (d.email?.sent) toast.success('Invitation envoyée par e-mail');
      else if (d.email) toast.error(d.email.error || 'E-mail non envoyé');
      else toast.success('Coordonnées enregistrées');
    },
  });
  const mark = useMutation({
    mutationFn: async (step: Step) => (await apiClient.post(`/stays/${stayId}/journey`, { step, channel: 'whatsapp' })).data,
    onSuccess: (r) => done((r?.data ?? r) as StayAccess),
  });
  const revoke = useMutation({
    mutationFn: async () => (await apiClient.post(`/stays/${stayId}/revoke`)).data,
    onSuccess: (r) => {
      done((r?.data ?? r) as StayAccess);
      toast.success('Ancien lien désactivé : un nouveau lien est prêt.');
    },
  });

  if (!data) return null;
  if (data.cancelled) return null;
  const step = data.nextStep ?? 'welcome';
  const emailKindNow = !email.trim() ? 'none' : /@([a-z0-9-]+\.)*(airbnb\.com|booking\.com|expediapartnercentral\.com|homeaway\.com|vrbo\.com|abritel\.fr)$/i.test(email.trim()) ? 'relay' : 'real';
  const copy = (text: string, what: string) => navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copié`));

  return (
    <section className="rounded-2xl border border-line p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-ink flex items-center gap-1.5">
          <UserPlus size={14} /> Espace client
        </p>
        {data.invitedAt ? (
          <span className="text-[11.5px] text-success font-semibold">Invité le {new Date(data.invitedAt).toLocaleDateString('fr-FR')}</span>
        ) : (
          <span className="text-[11.5px] text-muted">Pas encore invité</span>
        )}
      </div>
      <p className="text-[12.5px] text-muted">
        Un lien personnel, sans mot de passe : le livret d’accueil de {data.villa.name}
        {data.servicesCount > 0 ? ` et ses ${data.servicesCount} service${data.servicesCount > 1 ? 's' : ''} à réserver.` : '.'}
      </p>

      {(!data.guideReady || data.servicesCount === 0) && (
        <p className="flex items-start gap-1.5 rounded-xl bg-warning/10 px-2.5 py-2 text-[12px] text-ink-soft">
          <TriangleAlert size={13} className="shrink-0 mt-0.5 text-warning" />
          <span>
            {!data.guideReady && 'Livret d’accueil à compléter (heure d’arrivée ou adresse, et un contact). '}
            {data.servicesCount === 0 && 'Aucun service rattaché à la villa. '}
            <Link to={`/villas/${data.villa.id}`} className="font-semibold text-accent">
              Fiche villa
            </Link>
          </span>
        </p>
      )}

      <JourneyChips journey={data.journey} next={data.nextStep} />

      <div className="grid grid-cols-1 gap-2">
        <label className="block">
          <span className="text-[11.5px] text-muted">E-mail du client</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="adresse e-mail (si le client vous l’a donnée)" className="mt-1 w-full h-9 px-3 rounded-xl border border-line bg-surface text-[13px] text-ink" />
          {emailKindNow === 'relay' && <span className="block mt-1 text-[11.5px] text-warning">Adresse relais de la plateforme : les liens peuvent être filtrés. Préférez WhatsApp ou la messagerie Airbnb.</span>}
        </label>
        <label className="block">
          <span className="text-[11.5px] text-muted">Téléphone / WhatsApp</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 …" className="mt-1 w-full h-9 px-3 rounded-xl border border-line bg-surface text-[13px] text-ink" />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Mail size={13} />} disabled={emailKindNow === 'none'} loading={invite.isPending && invite.variables === true} onClick={() => invite.mutate(true)}>
          Envoyer par e-mail
        </Button>
        {data.whatsappUrl && phone.trim() === (data.contact.phone ?? '') ? (
          <a
            href={data.whatsappUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => mark.mutate(step)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-success text-white text-[12.5px] font-semibold"
          >
            <MessageCircle size={13} /> WhatsApp ({STEP_LABEL[step]})
          </a>
        ) : (
          <Button size="sm" variant="secondary" icon={<Send size={13} />} loading={invite.isPending && invite.variables === false} onClick={() => invite.mutate(false)}>
            Enregistrer le contact
          </Button>
        )}
        <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={() => copy(data.url, 'Lien')}>
          Lien
        </Button>
        <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={() => copy(data.messageText, 'Message')}>
          Message
        </Button>
      </div>
      <p className="text-[11.5px] text-muted">
        « Message » : le texte prêt à coller dans la messagerie Airbnb ou Booking.
        {data.autoMessages ? ' Accueil automatique actif pour cette villa : bienvenue, J-7, J-1 et merci partent seuls aux adresses e-mail réelles.' : ''}
      </p>
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Désactiver le lien déjà envoyé à ce client ? Un nouveau lien sera créé.')) revoke.mutate();
        }}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-danger hover:underline"
      >
        <ShieldOff size={12} /> Désactiver le lien envoyé
      </button>
    </section>
  );
}
