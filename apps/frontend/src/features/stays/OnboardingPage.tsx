import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bot, Copy, Mail, MessageCircle, TriangleAlert, UserPlus } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn, formatDay } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { JourneyChips, STEP_LABEL, StayInvitePanel } from '../reservations/StayInvitePanel';

type Step = 'welcome' | 'j7' | 'j1' | 'thanks';
interface Row {
  id: string;
  guest: string;
  villa: string;
  checkIn: string;
  checkOut: string;
  guests: number | null;
  lodgify: boolean;
  contact: { emailKind: 'real' | 'relay' | 'none'; email: string | null; phone: string | null };
  invitedAt: string | null;
  journey: Partial<Record<Step, { at: string; channel: string }>>;
  nextStep: Step | null;
  automatic: boolean;
  whatsappUrl: string | null;
  messageText: string | null;
  guideReady: boolean;
  servicesCount: number;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Arrivals to welcome: who was invited, which message is due, and the WhatsApp to send. */
export function OnboardingPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Row | null>(null);
  const [filter, setFilter] = useState<'todo' | 'all'>('todo');
  const { data = [], isLoading } = useQuery({
    queryKey: ['stays-onboarding'],
    queryFn: async () => {
      const r = await apiClient.get('/stays/onboarding', { params: { days: 30 } });
      return (r.data?.data ?? r.data) as Row[];
    },
    refetchInterval: 120_000,
  });
  const mark = useMutation({
    mutationFn: ({ id, step }: { id: string; step: Step }) => apiClient.post(`/stays/${id}/journey`, { step, channel: 'whatsapp' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stays-onboarding'] }),
  });

  // To do by hand: a message is due and nothing sends it by itself.
  const todo = useMemo(() => data.filter((r) => r.nextStep && !r.automatic), [data]);
  const rows = filter === 'todo' ? todo : data;
  const missing = new Set(data.filter((r) => !r.guideReady || r.servicesCount === 0).map((r) => r.villa));

  return (
    <div className="space-y-5 max-w-[1100px]">
      <PageHeader
        title="Accueil voyageurs"
        description="Arrivées des 30 prochains jours : invitation à l’espace séjour (livret d’accueil + services de la villa) et messages du parcours — bienvenue, J-7, J-1, merci."
      />

      {missing.size > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-[13px] text-ink-soft">
          <TriangleAlert size={16} className="shrink-0 mt-0.5 text-warning" />
          <span>
            Livret ou services à compléter pour : <b className="text-ink">{[...missing].join(', ')}</b> (fiche villa).
          </span>
        </p>
      )}

      <div className="flex items-center gap-2">
        {(
          [
            ['todo', `À envoyer aujourd’hui (${todo.length})`],
            ['all', `Toutes les arrivées (${data.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn('h-8 px-3.5 rounded-full text-[12.5px] font-semibold border', filter === k ? 'bg-primary text-on-primary border-primary' : 'bg-surface border-line text-ink-soft')}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center text-[14px] text-muted">
          {filter === 'todo' ? 'Rien à envoyer à la main aujourd’hui.' : 'Aucune arrivée dans les 30 prochains jours.'}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <article key={r.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold text-ink">
                    {r.guest} <span className="font-normal text-muted">· {r.villa}</span>
                  </p>
                  <p className="text-[12.5px] text-ink-soft">
                    {formatDay(r.checkIn)} → {formatDay(r.checkOut)}
                    {r.checkIn.slice(0, 10) === today() ? ' · arrive aujourd’hui' : ''}
                    {r.guests ? ` · ${r.guests} pers.` : ''}
                    {' · '}
                    {r.contact.emailKind === 'real' ? r.contact.email : r.contact.emailKind === 'relay' ? 'e-mail relais plateforme' : 'pas d’e-mail'}
                    {r.contact.phone ? ` · ${r.contact.phone}` : ' · pas de téléphone'}
                  </p>
                  <div className="mt-2">
                    <JourneyChips journey={r.journey} next={r.nextStep} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {r.nextStep && r.automatic && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-success font-semibold">
                      <Bot size={13} /> {STEP_LABEL[r.nextStep]} part ce matin par e-mail
                    </span>
                  )}
                  {r.nextStep && !r.automatic && r.whatsappUrl && (
                    <a
                      href={r.whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => mark.mutate({ id: r.id, step: r.nextStep! })}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-success text-white text-[12.5px] font-semibold"
                    >
                      <MessageCircle size={13} /> {STEP_LABEL[r.nextStep]}
                    </a>
                  )}
                  {r.nextStep && !r.automatic && !r.whatsappUrl && r.messageText && (
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard?.writeText(r.messageText!).then(() => {
                          toast.success('Message copié : collez-le dans la messagerie de la plateforme');
                          mark.mutate({ id: r.id, step: r.nextStep! });
                        })
                      }
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-line-strong text-[12.5px] font-semibold text-ink"
                    >
                      <Copy size={13} /> Copier « {STEP_LABEL[r.nextStep]} »
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(r)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-line text-[12.5px] font-semibold text-ink-soft hover:text-ink"
                  >
                    {r.invitedAt ? <Mail size={13} /> : <UserPlus size={13} />} {r.invitedAt ? 'Invitation' : 'Inviter'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.guest ?? ''} description={open?.villa} size="lg">
        {open && <StayInvitePanel stayId={open.id} />}
      </Modal>
    </div>
  );
}
