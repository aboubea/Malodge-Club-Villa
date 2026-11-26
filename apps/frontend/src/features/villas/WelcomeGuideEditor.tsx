import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BookOpen, CheckCircle2, Save, TriangleAlert } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

interface Guide {
  welcome?: string;
  checkInTime?: string;
  checkOutTime?: string;
  address?: string;
  directions?: string;
  access?: string;
  wifiName?: string;
  wifiPassword?: string;
  rules?: string;
  practical?: string;
  contactName?: string;
  contactPhone?: string;
  emergency?: string;
  autoMessages?: boolean;
}
interface GuideResponse {
  guide: Guide;
  ready: boolean;
  usesHouse: { id: string; name: string } | null;
  servicesCount: number;
}

const input = 'mt-1 w-full h-10 px-3 rounded-xl border border-line bg-surface text-[13.5px] text-ink focus:outline-none focus:ring-4 focus:ring-ink/5';
const area = 'mt-1 w-full px-3 py-2 rounded-xl border border-line bg-surface text-[13.5px] text-ink focus:outline-none focus:ring-4 focus:ring-ink/5';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11.5px] text-muted">{hint}</span>}
    </label>
  );
}

/** The villa's welcome booklet, shown to its guests in their stay space. */
export function WelcomeGuideEditor({ villaId }: { villaId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['villa-guide', villaId],
    queryFn: async () => {
      const r = await apiClient.get(`/villas/${villaId}/guide`);
      return (r.data?.data ?? r.data) as GuideResponse;
    },
  });
  const [g, setG] = useState<Guide>({});
  useEffect(() => {
    if (data) setG(data.guide);
  }, [data]);
  const save = useMutation({
    mutationFn: async () => (await apiClient.put(`/villas/${villaId}/guide`, g)).data,
    onSuccess: (r) => {
      qc.setQueryData(['villa-guide', villaId], r?.data ?? r);
      toast.success('Livret d’accueil enregistré');
    },
  });
  if (!data) return null;

  if (data.usesHouse) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen size={15} /> Livret d’accueil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[13px] text-ink-soft">
            Cette annonce est une formule : ses clients reçoivent le livret de la maison{' '}
            <Link to={`/villas/${data.usesHouse.id}`} className="font-semibold text-accent">
              {data.usesHouse.name}
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  const set = (k: keyof Guide) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setG((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <CardTitle className="flex items-center gap-2">
            <BookOpen size={15} /> Livret d’accueil des clients
          </CardTitle>
          {data.ready ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success">
              <CheckCircle2 size={13} /> Prêt
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-warning">
              <TriangleAlert size={13} /> À compléter
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[12.5px] text-muted">
          Affiché dans l’espace séjour de chaque client de cette villa (et de ses formules). Les services proposés sont ceux de la section « Services disponibles »
          ({data.servicesCount}).
        </p>
        <Field label="Mot d’accueil">
          <textarea rows={3} value={g.welcome ?? ''} onChange={set('welcome')} placeholder="Bienvenue au riad ! Toute l’équipe est à votre disposition…" className={area} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Arrivée à partir de">
            <input value={g.checkInTime ?? ''} onChange={set('checkInTime')} placeholder="16:00" className={input} />
          </Field>
          <Field label="Départ avant">
            <input value={g.checkOutTime ?? ''} onChange={set('checkOutTime')} placeholder="11:00" className={input} />
          </Field>
        </div>
        <Field label="Adresse précise">
          <input value={g.address ?? ''} onChange={set('address')} placeholder="Derb …, Médina, Marrakech" className={input} />
        </Field>
        <Field label="Comment venir (parking, repères)">
          <textarea rows={2} value={g.directions ?? ''} onChange={set('directions')} className={area} />
        </Field>
        <Field label="Accès à la villa (clés, codes, gardien)" hint="Visible par le client seulement 2 jours avant son arrivée et jusqu’à son départ.">
          <textarea rows={2} value={g.access ?? ''} onChange={set('access')} className={area} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wi-Fi : réseau">
            <input value={g.wifiName ?? ''} onChange={set('wifiName')} className={input} />
          </Field>
          <Field label="Wi-Fi : mot de passe" hint="Visible 2 jours avant l’arrivée.">
            <input value={g.wifiPassword ?? ''} onChange={set('wifiPassword')} className={input} />
          </Field>
        </div>
        <Field label="Règles de la maison">
          <textarea rows={3} value={g.rules ?? ''} onChange={set('rules')} placeholder="Pas de fête, piscine non surveillée…" className={area} />
        </Field>
        <Field label="Infos pratiques">
          <textarea rows={3} value={g.practical ?? ''} onChange={set('practical')} placeholder="Ménage, climatisation, commerces proches…" className={area} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact sur place : nom">
            <input value={g.contactName ?? ''} onChange={set('contactName')} placeholder="Youssef" className={input} />
          </Field>
          <Field label="Contact : téléphone WhatsApp">
            <input value={g.contactPhone ?? ''} onChange={set('contactPhone')} placeholder="+212 6 …" className={input} />
          </Field>
        </div>
        <Field label="Urgences">
          <textarea rows={2} value={g.emergency ?? ''} onChange={set('emergency')} placeholder="Médecin, pharmacie de garde, police…" className={area} />
        </Field>
        <label className="flex items-start gap-2.5 rounded-xl border border-line p-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={!!g.autoMessages} onChange={(e) => setG((p) => ({ ...p, autoMessages: e.target.checked }))} />
          <span className="text-[13px] text-ink-soft">
            <b className="text-ink">Accueil automatique</b> : chaque matin, les e-mails « Bienvenue », « J-7 extras », « J-1 arrivée » et « Merci » partent seuls aux
            clients de cette villa qui ont une adresse e-mail réelle (jamais aux adresses relais Airbnb / Booking). Les autres apparaissent dans « Accueil clients »
            avec le message WhatsApp prêt.
          </span>
        </label>
        <Button icon={<Save size={14} />} loading={save.isPending} onClick={() => save.mutate()}>
          Enregistrer le livret
        </Button>
      </CardContent>
    </Card>
  );
}
